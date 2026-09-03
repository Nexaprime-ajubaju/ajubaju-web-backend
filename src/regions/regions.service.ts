import { Injectable, HttpException, HttpStatus, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { BannerPricingService } from '../banners/services/banner-pricing.service';
import { AdPricingService } from '../ads/services/ad-pricing.service';
import { RedisService } from '../common/services/redis.service';

const LOCAL_CITIES_FALLBACK = [
  { name: 'Kolhapur', displayName: 'Kolhapur, Maharashtra', lat: 16.7050, lng: 74.2433, population: 549283 },
  { name: 'Sangli', displayName: 'Sangli, Maharashtra', lat: 16.8524, lng: 74.5816, population: 502778 },
  { name: 'Pune', displayName: 'Pune, Maharashtra', lat: 18.5204, lng: 73.8567, population: 3124458 },
  { name: 'Mumbai', displayName: 'Mumbai, Maharashtra', lat: 19.0760, lng: 72.8777, population: 12442373 },
  { name: 'Satara', displayName: 'Satara, Maharashtra', lat: 17.6805, lng: 73.9916, population: 120161 },
  { name: 'Miraj', displayName: 'Miraj, Maharashtra', lat: 16.8735, lng: 74.6465, population: 190000 },
  { name: 'Ichalkaranji', displayName: 'Ichalkaranji, Maharashtra', lat: 16.6961, lng: 74.4578, population: 287570 },
  { name: 'Jaysingpur', displayName: 'Jaysingpur, Maharashtra', lat: 16.7797, lng: 74.5576, population: 43000 },
  { name: 'Karad', displayName: 'Karad, Maharashtra', lat: 17.2855, lng: 74.1839, population: 84000 },
  { name: 'Kagal', displayName: 'Kagal, Maharashtra', lat: 16.5772, lng: 74.2647, population: 32845 },
  { name: 'Ashta', displayName: 'Ashta, Maharashtra', lat: 16.9472, lng: 74.4042, population: 37105 },
  { name: 'Warananagar', displayName: 'Warananagar, Maharashtra', lat: 16.8964, lng: 74.1989, population: 25000 },
  { name: 'Gargoti', displayName: 'Gargoti, Maharashtra', lat: 16.3155, lng: 74.1378, population: 22000 },
  { name: 'Gadhinglaj', displayName: 'Gadhinglaj, Maharashtra', lat: 16.2272, lng: 74.3489, population: 79997 },
  { name: 'Nipani', displayName: 'Nipani, Karnataka', lat: 16.3978, lng: 74.3789, population: 62450 },
  { name: 'Belagavi', displayName: 'Belagavi, Karnataka', lat: 15.8497, lng: 74.4977, population: 488164 }
];

@Injectable()
export class RegionsService {
  private readonly logger = new Logger(RegionsService.name);

  constructor(
    private readonly pricingService: BannerPricingService,
    private readonly adPricingService: AdPricingService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async searchLocations(query: string, scale: string, mode?: string) {
    if (!query || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim().toLowerCase();
    const cacheKey = `golo:regions:search:${cleanQuery}:${scale || 'all'}:${mode || 'default'}`;
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<any>(cacheKey);
        if (cached) return cached;
      } catch (e) {
        // Safe fallback
      }
    }

    try {
      const isAdMode = mode === 'ad';

      const username = process.env.GEONAMES_USERNAME || 'atharvapugade';
      // Base GeoNames API URL — always search populated places for ad mode
      let url = `http://api.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&country=IN&maxRows=50&username=${username}`;

      if (!isAdMode && scale === 'District') {
        // Banner: District search uses ADM2 feature code
        url += '&featureCode=ADM2';
      } else {
        // Ad mode or banner Town/City: populated places
        url += '&featureClass=P';
      }

      let geonames = [];
      try {
        const response = await axios.get(url);
        if (response.data && Array.isArray(response.data.geonames)) {
          geonames = response.data.geonames;
        } else if (response.data && response.data.status) {
          this.logger.warn(`GeoNames API returned status error: ${response.data.status.message}. Using local cities fallback.`);
        }
      } catch (err) {
        this.logger.error(`Failed to fetch from GeoNames API: ${err.message}. Using local cities fallback.`);
      }

      // Fallback search in local database
      if (geonames.length === 0) {
        const qLower = query.toLowerCase().trim();
        const matchedLocal = LOCAL_CITIES_FALLBACK.filter(c => 
          c.name.toLowerCase().startsWith(qLower) || 
          c.displayName.toLowerCase().includes(qLower)
        );

        geonames = matchedLocal.map(c => ({
          name: c.name,
          adminName1: c.displayName.split(', ')[1] || 'Maharashtra',
          lat: c.lat.toString(),
          lng: c.lng.toString(),
          population: c.population
        }));
      }

      const results = [];

      for (const place of geonames) {
        const population = place.population || 0;

        if (!isAdMode) {
          // Apply banner scale filters
          if (scale === 'Town' && population >= 100000) continue;
          if (scale === 'City' && population < 100000) continue;
        }

        // Banner daily rate (existing behaviour)
        const dailyRate = this.pricingService.calculateDailyRate(population);

        const resultItem: any = {
          name: place.name,
          displayName: `${place.name}, ${place.adminName1 || 'India'}`,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lng),
          population: population,
          dailyRate: dailyRate,
          type: isAdMode ? 'area' : scale,
        };

        if (isAdMode) {
          // Return per-template ad pricing for all 3 templates
          resultItem.adDailyRates = this.adPricingService.getAllTemplateRates(population);
        }

        results.push(resultItem);

        // Limit results to 10 max after filtering
        if (results.length >= 10) break;
      }

      if (this.redisService && results.length > 0) {
        try {
          await this.redisService.set(cacheKey, results, 86400); // 24 hours TTL
        } catch (e) {
          // Ignore cache write failure
        }
      }

      return results;
    } catch (error) {
      console.error('Error fetching from GeoNames API:', error.message);
      throw new HttpException('Failed to fetch regions', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Also need a function to strictly fetch a location's population during checkout validation
  async verifyLocationPopulation(name: string, scale: string): Promise<number> {
    try {
      const username = process.env.GEONAMES_USERNAME || 'atharvapugade';
      let url = `http://api.geonames.org/searchJSON?name_equals=${encodeURIComponent(name)}&country=IN&maxRows=1&username=${username}`;
      if (scale === 'District') url += '&featureCode=ADM2';
      else url += '&featureClass=P';

      const response = await axios.get(url);
      const geonames = response.data?.geonames || [];
      if (geonames.length > 0) {
        return geonames[0].population || 0;
      }
      return 0; // Fallback
    } catch (e) {
      console.error('Error verifying location population:', e.message);
      return 0;
    }
  }

  // Resolves a location name into its hierarchy (name, district, state)
  async resolveHierarchy(locationName: string): Promise<{ name: string; district: string; state: string } | null> {
    if (!locationName || locationName.toLowerCase() === 'global') return null;
    try {
      const parsedName = locationName.split(',')[0].trim();
      const username = process.env.GEONAMES_USERNAME || 'atharvapugade';
      const url = `http://api.geonames.org/searchJSON?name_equals=${encodeURIComponent(parsedName)}&country=IN&maxRows=1&username=${username}`;
      const response = await axios.get(url);
      const geonames = response.data?.geonames || [];
      if (geonames.length > 0) {
        const place = geonames[0];
        return {
          name: place.name || locationName,
          district: place.adminName2 || place.name || locationName,
          state: place.adminName1 || 'India'
        };
      }
      return null;
    } catch (e) {
      console.error(`Error resolving hierarchy for ${locationName}:`, e.message);
      return null;
    }
  }
}
