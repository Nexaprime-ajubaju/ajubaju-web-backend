import { Injectable, OnModuleInit } from '@nestjs/common';
import { RankingComponent, RankingComponentContext, RankingComponentResult } from './ranking-component.interface';
import { NearbyScorer } from '../../scorers/nearby.scorer';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class DistanceComponent implements RankingComponent, OnModuleInit {
  readonly key = 'distance';
  private readonly maxDistKm = 15;

  constructor(
    private readonly nearbyScorer: NearbyScorer,
    private readonly registry: RankingComponentRegistry
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { candidate, context } = params;

    if (!context.coordinates) {
      // If user hasn't provided location, ignore distance penalty for all
      return { score: 1.0 };
    }

    if (!candidate.locationCoordinates?.coordinates) {
      return { score: 0 };
    }

    const dist = this.calculateDistance(
      context.coordinates.latitude,
      context.coordinates.longitude,
      candidate.locationCoordinates.coordinates[1],
      candidate.locationCoordinates.coordinates[0]
    );

    const score = Math.max(0, 1 - (dist / this.maxDistKm));

    return {
      score,
      reason: score > 0.8 ? 'Very close to you' : undefined
    };
  }

  // Haversine formula
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
