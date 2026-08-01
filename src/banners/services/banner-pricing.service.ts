import { Injectable } from '@nestjs/common';

@Injectable()
export class BannerPricingService {
  /**
   * Calculates the daily rate based strictly on the population of the region.
   * @param population The population size
   * @returns The daily rate in rupees
   */
  calculateDailyRate(population: number): number {
    if (!population || population < 50000) {
      return 200; // Tier 1: < 50,000
    }
    if (population >= 50000 && population < 100000) {
      return 300; // Tier 2: 50,000 - 100,000
    }
    if (population >= 100000 && population < 200000) {
      return 500; // Tier 3: 100,000 - 200,000
    }
    if (population >= 200000 && population < 500000) {
      return 800; // Tier 4: 200,000 - 500,000
    }
    if (population >= 500000 && population < 1000000) {
      return 1200; // Tier 5: 500,000 - 1,000,000
    }
    if (population >= 1000000 && population < 5000000) {
      return 2000; // Tier 6: 1,000,000 - 5,000,000
    }
    return 3000; // Tier 7: >= 5,000,000
  }
}
