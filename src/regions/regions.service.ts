import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { BannerPricingService } from '../banners/services/banner-pricing.service';

@Injectable()
export class RegionsService {
  constructor(private readonly pricingService: BannerPricingService) {}

  async searchLocations(query: string, scale: string) {
    if (!query) {
      return [];
    }

    try {
      // Base GeoNames API URL
      let url = `http://api.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&country=IN&maxRows=50&username=atharvapugade`;

      // If scale is District, search for ADM2 feature code (Districts in India)
      if (scale === 'District') {
        url += '&featureCode=ADM2';
      } else {
        // For Town or City, we look for populated places
        url += '&featureClass=P';
      }

      const response = await axios.get(url);
      const geonames = response.data?.geonames || [];

      // Filter and map results based on scale
      const results = [];

      for (const place of geonames) {
        const population = place.population || 0;

        // Apply scale filters
        if (scale === 'Town') {
          // Town: Must have population less than 100k (but also filter out 0 population if possible, but some small towns might have 0 in DB)
          if (population >= 100000) continue;
        } else if (scale === 'City') {
          // City: Must have population 100k or more
          if (population < 100000) continue;
        }

        // Calculate dynamic daily rate based on population
        const dailyRate = this.pricingService.calculateDailyRate(population);

        results.push({
          name: place.name,
          displayName: `${place.name}, ${place.adminName1 || 'India'}`,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lng),
          population: population,
          dailyRate: dailyRate,
          type: scale
        });

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
