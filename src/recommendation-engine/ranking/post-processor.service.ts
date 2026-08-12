import { Injectable, Logger } from '@nestjs/common';
import { CandidateWithScore } from './ranking.service';
import { RankingPolicy } from './policies/ranking-policy.interface';
import { ActiveStatusPolicy } from './policies/active-status.policy';
import { ProgressiveDiversityPolicy } from './policies/progressive-diversity.policy';

@Injectable()
export class PostProcessorService {
  private readonly logger = new Logger(PostProcessorService.name);
  private policies: RankingPolicy[];

  constructor(
    private readonly activeStatusPolicy: ActiveStatusPolicy,
    private readonly diversityPolicy: ProgressiveDiversityPolicy,
  ) {
    // Execution order matters. Filter dead items before attempting diversity.
    this.policies = [this.activeStatusPolicy, this.diversityPolicy];
  }

  /**
   * Applies business rules and diversity filtering sequentially to a ranked list of candidates.
   */
  process(rankedCandidates: CandidateWithScore[], limit: number = 15): any[] {
    let currentCandidates = [...rankedCandidates];

    for (const policy of this.policies) {
      currentCandidates = policy.apply(currentCandidates, limit);
    }

    // Map to final payload, attaching explainability metrics
    const finalProducts = [];

    for (const s of currentCandidates) {
      if (finalProducts.length >= limit) break;

      const offer = s.product;
      const explainability = {
        finalScore: s.finalScore,
        components: s.components,
        matchedTags: s.matchedTags,
        matchedCategories: s.matchedCategories,
        policyAdjustments: s.policyAdjustments,
        reasons: s.reasons,
      };

      const hasOfferImage = !!(offer.imageUrl || (offer.images && offer.images[0]));

      if (offer.selectedProducts && offer.selectedProducts.length > 0) {
        if (hasOfferImage) {
          // If the offer has its own banner, present the offer as a single card using offer details
          const firstProduct = offer.selectedProducts[0];
          let discountPercent = 0;
          if (firstProduct.originalPrice && firstProduct.offerPrice && firstProduct.originalPrice > firstProduct.offerPrice) {
            discountPercent = Math.round(((firstProduct.originalPrice - firstProduct.offerPrice) / firstProduct.originalPrice) * 100);
          }
          finalProducts.push({
            id: offer._id?.toString() || offer.id,
            type: 'offer',
            title: offer.title || firstProduct.productName,
            category: offer.category,
            imageUrl: offer.imageUrl || (offer.images && offer.images[0]),
            price: firstProduct.offerPrice,
            originalPrice: firstProduct.originalPrice,
            discountPercent,
            merchantId: offer.merchantId,
            merchantName: offer.merchantName,
            offerId: offer._id?.toString() || offer.id,
            recommendationExplainability: explainability
          });
        } else {
          // Otherwise, unpack into individual product cards
          for (const sp of offer.selectedProducts) {
            if (finalProducts.length >= limit) break;

            let discountPercent = 0;
            if (sp.originalPrice && sp.offerPrice && sp.originalPrice > sp.offerPrice) {
              discountPercent = Math.round(((sp.originalPrice - sp.offerPrice) / sp.originalPrice) * 100);
            }

            finalProducts.push({
              id: `${offer._id?.toString()}_${sp.productId || sp._id?.toString() || Math.random().toString(36).substring(7)}`,
              type: 'offer',
              title: sp.productName,
              category: offer.category,
              imageUrl: sp.imageUrl || '/images/placeholder.webp',
              price: sp.offerPrice,
              originalPrice: sp.originalPrice,
              discountPercent,
              merchantId: offer.merchantId,
              merchantName: offer.merchantName,
              offerId: offer._id?.toString() || offer.id,
              recommendationExplainability: explainability
            });
          }
        }
      } else {
        // Fallback to presenting the offer itself if no specific products are selected
        const p = { ...offer };
        p.id = p.userId ? p.userId.toString() : (p._id ? p._id.toString() : p.id);
        p.merchantId = p.merchantId || p.userId;
        p.type = p.type || 'offer';
        p.imageUrl = p.imageUrl || (p.images && p.images[0]) || '/images/placeholder.webp';
        p.badge = p.promoTag || null;
        p.recommendationExplainability = explainability;
        finalProducts.push(p);
      }
    }

    return finalProducts;
  }
}
