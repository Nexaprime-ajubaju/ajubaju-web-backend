import { RecommendationContext } from './recommendation.context';

export enum RecommendationReason {
  EXACT_COORDINATES = 'exact_coordinates',
  EXPANDED_RADIUS = 'expanded_radius',
  ENTIRE_CITY = 'entire_city',
  ENTIRE_STATE = 'entire_state',
  OFFLINE_TRENDING = 'offline_trending',
  POPULAR_PRODUCTS = 'popular_products',
  RECENT_PRODUCTS = 'recent_products',
  ACTIVE_DISCOUNTS = 'active_discounts',
  PROMOTED_BANNERS = 'promoted_banners',
  OFFLINE_PURCHASES = 'offline_purchases',
  HIGH_CLICKS = 'high_clicks',
  LAST_7_DAYS = 'last_7_days',
  LAST_14_DAYS = 'last_14_days',
  LAST_30_DAYS = 'last_30_days',
  USER_HISTORY = 'user_history',
  ACTIVE_CART = 'active_cart',
  ABANDONED_CART = 'abandoned_cart',
  MIXED_SIGNALS = 'mixed_signals',
  PROFILE_CATEGORIES = 'profile_categories',
  PREVIOUS_ORDERS = 'previous_orders',
  COLLABORATIVE_FILTERING = 'collaborative_filtering',
}

export enum RecommendationSource {
  OFFLINE = 'offline',
  ONLINE = 'online',
  CACHE = 'cache',
  FALLBACK = 'fallback',
  HYBRID = 'hybrid',
}

export interface StrategyResult<T = any> {
  products: T[];
  metadata: {
    confidence: number;
    reason: RecommendationReason;
    source: RecommendationSource;
    fallbackUsed?: boolean;
    retrievedCandidates?: number;
    returnedProducts?: number;
  };
}

export interface RecommendationStrategy {
  key: string;
  priority?: number;
  cacheTTL?: number; // TTL in seconds
  requiresLocation?: boolean;

  getRecommendations(context: RecommendationContext): Promise<StrategyResult>;
}
