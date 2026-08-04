import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { BannerPricingService } from '../banners/services/banner-pricing.service';
import { AdPricingService } from '../ads/services/ad-pricing.service';

@Injectable()
export class RegionsService {
  constructor(
    private readonly pricingService: BannerPricingService,
    private readonly adPricingService: AdPricingService,
  ) {}

  async searchLocations(query: string, scale: string, mode?: string) {
    if (!query) {
      return [];
    }

    try {
      const isAdMode = mode === 'ad';

      // Base GeoNames API URL — always search populated places for ad mode
      let url = `http://api.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&country=IN&maxRows=50&username=atharvapugade`;

      if (!isAdMode && scale === 'District') {
        // Banner: District search uses ADM2 feature code
        url += '&featureCode=ADM2';
      } else {
        // Ad mode or banner Town/City: populated places
        url += '&featureClass=P';
      }

      const response = await axios.get(url);
      const geonames = response.data?.geonames || [];

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

      return results;
    } catch (error) {
      console.error('Error fetching from GeoNames API:', error.message);
      throw new HttpException('Failed to fetch regions', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Also need a function to strictly fetch a location's population during checkout validation
  async verifyLocationPopulation(name: string, scale: string): Promise<number> {
    try {
      let url = `http://api.geonames.org/searchJSON?name_equals=${encodeURIComponent(name)}&country=IN&maxRows=1&username=atharvapugade`;
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
      const url = `http://api.geonames.org/searchJSON?name_equals=${encodeURIComponent(parsedName)}&country=IN&maxRows=1&username=atharvapugade`;
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
