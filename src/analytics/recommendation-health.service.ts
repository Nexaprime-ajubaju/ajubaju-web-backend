import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationLog, RecommendationLogDocument } from './schemas/recommendation-log.schema';

@Injectable()
export class RecommendationHealthService {
  private readonly logger = new Logger(RecommendationHealthService.name);
  private readonly LATENCY_THRESHOLD_MS = 500; // Flag execution times over 500ms

  constructor(
    @InjectModel(RecommendationLog.name) private readonly logModel: Model<RecommendationLogDocument>,
  ) {}

  @OnEvent('recommendation.generated')
  async handleRecommendationGenerated(payload: any) {
    try {
      // Monitor for Empty Responses
      if (payload.productCount === 0 && !payload.error) {
        this.logger.warn(`Recommendation Health Alert: Empty response for strategy [${payload.strategy}] variant [${payload.variant}]. User: ${payload.userId || 'guest'}`);
        // Here we could emit a metric to Datadog/Prometheus or trigger a Slack alert
      }

      // Monitor for High Latency
      if (payload.executionTime > this.LATENCY_THRESHOLD_MS && !payload.cacheHit) {
        this.logger.warn(`Recommendation Health Alert: High latency (${payload.executionTime}ms) for strategy [${payload.strategy}]. User: ${payload.userId || 'guest'}`);
        // Here we could emit a metric to Datadog/Prometheus or trigger a Slack alert
      }

      // Monitor for Errors
      if (payload.error) {
        this.logger.error(`Recommendation Health Alert: Error in strategy [${payload.strategy}]: ${payload.error}`);
        // Alerting system integration goes here
      }
    } catch (error) {
      this.logger.error(`Failed to process recommendation health check: ${error.message}`);
    }
  }

  // Example API to get current health status based on recent logs
  async getHealthStatus() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const [emptyResponses, slowResponses, errors] = await Promise.all([
      this.logModel.countDocuments({ createdAt: { $gte: tenMinutesAgo }, productCount: 0, error: { $exists: false } }),
      this.logModel.countDocuments({ createdAt: { $gte: tenMinutesAgo }, executionTime: { $gt: this.LATENCY_THRESHOLD_MS }, cacheHit: false }),
      this.logModel.countDocuments({ createdAt: { $gte: tenMinutesAgo }, error: { $exists: true, $ne: null } }),
    ]);

    return {
      status: (errors > 5 || slowResponses > 50) ? 'degraded' : 'healthy',
      last10Minutes: {
        emptyResponses,
        slowResponses,
        errors,
      }
    };
  }
}
