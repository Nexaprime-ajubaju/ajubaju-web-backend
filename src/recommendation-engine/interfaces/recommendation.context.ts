export interface RecommendationContext {
  userId?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  area?: string;
  pincode?: string;
  page?: number;
  limit?: number;
  language?: string;
  platform?: string;
  timezone?: string;
  isGuest?: boolean;
  coordinates?: { latitude: number; longitude: number };
  experimentVariant?: string;
  productId?: string;
}
