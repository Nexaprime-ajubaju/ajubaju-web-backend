import { Injectable } from '@nestjs/common';

/**
 * Base prices per day (₹) for each template, at the lowest population tier (< 50,000).
 * Template 1 = Multi-Image Ad
 * Template 2 = Single Image Ad
 * Template 3 = Text-Only Ad
 */
const BASE_PRICES: Record<number, number> = {
  1: 25, // Multi-Image
  2: 15, // Single Image
  3: 10, // Text-Only
};

/**
 * Population tiers with their multipliers.
 * Each entry: [minPopulation, multiplier]
 */
const POPULATION_TIERS: [number, number][] = [
  [0,          1.0], // Tier 1: < 50,000
  [50000,      1.5], // Tier 2: 50k – 1L
  [100000,     2.0], // Tier 3: 1L – 2L
  [200000,     3.0], // Tier 4: 2L – 5L
  [500000,     4.0], // Tier 5: 5L – 10L
  [1000000,    6.0], // Tier 6: 10L – 50L
  [5000000,    8.0], // Tier 7: >= 50L
];

@Injectable()
export class AdPricingService {
  /**
   * Returns the per-day rate (₹) for a given population and template.
   * @param population Population of the city
   * @param templateId Template ID: 1 (multi-image), 2 (single image), 3 (text-only)
   */
  getAdDailyRate(population: number, templateId: number = 1): number {
    const base = BASE_PRICES[templateId] ?? BASE_PRICES[1];
    let multiplier = 1.0;

    for (const [minPop, mult] of POPULATION_TIERS) {
      if (population >= minPop) {
        multiplier = mult;
      } else {
        break;
      }
    }

    return Math.round(base * multiplier);
  }

  /**
   * Returns a rates object for all 3 templates for a given population.
   * Useful for returning pricing info in the search API.
   */
  getAllTemplateRates(population: number): { t1: number; t2: number; t3: number } {
    return {
      t1: this.getAdDailyRate(population, 1),
      t2: this.getAdDailyRate(population, 2),
      t3: this.getAdDailyRate(population, 3),
    };
  }

  /**
   * Returns the base prices for Tier 1 (population < 50k).
   * Used as the default on the template selection page.
   */
  getBasePrices(): { t1: number; t2: number; t3: number } {
    return { t1: 25, t2: 15, t3: 10 };
  }
}
