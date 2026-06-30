import { Injectable } from '@nestjs/common';

@Injectable()
export class NearbyScorer {
  // Configurable weights
  private readonly DISTANCE_WEIGHT = 0.4;
  private readonly RATING_WEIGHT = 0.3;
  private readonly POPULARITY_WEIGHT = 0.2;
  private readonly DELIVERY_WEIGHT = 0.1;

  score(merchants: any[]): any[] {
    return merchants.map(merchant => {
      // Normalize distance: Closer is better. Assuming calculatedDistance is in meters. Max radius is 20000m.
      const rawDistance = merchant.calculatedDistance || 20000;
      const normalizedDistance = Math.max(0, 1 - (rawDistance / 20000));

      // Normalize rating: Assume scale of 0-5
      const rawRating = merchant.rating || merchant.averageRating || 0;
      const normalizedRating = Math.max(0, Math.min(1, rawRating / 5));

      // Normalize popularity: Total orders or views. Arbitrary cap at 1000 for normalization.
      const rawPopularity = merchant.totalOrders || merchant.orderCount || 0;
      const normalizedPopularity = Math.max(0, Math.min(1, rawPopularity / 1000));

      // Normalize delivery: Faster is better. Assume deliveryTime in minutes, cap at 120 mins.
      const rawDelivery = merchant.deliveryTime || merchant.estimatedDeliveryTime || 60;
      const normalizedDelivery = Math.max(0, 1 - (rawDelivery / 120));

      const finalScore = 
        (normalizedDistance * this.DISTANCE_WEIGHT) +
        (normalizedRating * this.RATING_WEIGHT) +
        (normalizedPopularity * this.POPULARITY_WEIGHT) +
        (normalizedDelivery * this.DELIVERY_WEIGHT);

      return {
        ...merchant,
        finalScore
      };
    });
  }
}
