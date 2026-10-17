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

      const hasOfferImage = !!(
        offer.imageUrl ||
        (offer.images && offer.images[0])
      );

      if (offer.selectedProducts && offer.selectedProducts.length > 0) {
        if (hasOfferImage) {
          // If the offer has its own banner, present the offer as a single card using offer total price
          const totalOfferPrice = offer.selectedProducts.reduce(
            (sum: number, p: any) => sum + (Number(p.offerPrice) || 0),
            0,
          );
          const totalOriginalPrice = offer.selectedProducts.reduce(
            (sum: number, p: any) => sum + (Number(p.originalPrice) || 0),
            0,
          );
          let discountPercent = 0;
          if (
            totalOriginalPrice > 0 &&
            totalOfferPrice > 0 &&
            totalOriginalPrice > totalOfferPrice
          ) {
            discountPercent = Math.round(
              ((totalOriginalPrice - totalOfferPrice) / totalOriginalPrice) *
                100,
            );
          }
          finalProducts.push({
            id: offer._id?.toString() || offer.id,
            type: 'offer',
            title: offer.title || offer.selectedProducts[0]?.productName,
            description: offer.description || '',
            category: offer.category,
            imageUrl: offer.imageUrl || (offer.images && offer.images[0]),
            price: totalOfferPrice > 0 ? totalOfferPrice : null,
            originalPrice: totalOriginalPrice > 0 ? totalOriginalPrice : null,
            discountPercent,
            merchantId: offer.merchantId,
            storeName:
              (offer.merchant &&
                (offer.merchant.storeName || offer.merchant.name)) ||
              offer.storeName ||
              offer.merchantName ||
              '',
            merchantName:
              (offer.merchant &&
                (offer.merchant.storeName || offer.merchant.name)) ||
              offer.storeName ||
              offer.merchantName ||
              '',
            location:
              offer.storeLocation ||
              offer.merchantLocation ||
              offer.location ||
              offer.city ||
              (offer.merchant &&
                (offer.merchant.storeLocation || offer.merchant.city)) ||
              '',
            storeLocation:
              offer.storeLocation ||
              offer.merchantLocation ||
              offer.location ||
              offer.city ||
              (offer.merchant &&
                (offer.merchant.storeLocation || offer.merchant.city)) ||
              '',
            startDate: offer.startDate,
            endDate: offer.endDate,
            validUntil: offer.endDate,
            promoTag: offer.promoTag || '',
            offerId: offer._id?.toString() || offer.id,
            recommendationExplainability: explainability,
          });
        } else {
          // Otherwise, unpack into individual product cards
          for (const sp of offer.selectedProducts) {
            if (finalProducts.length >= limit) break;

            let discountPercent = 0;
            if (
              sp.originalPrice &&
              sp.offerPrice &&
              sp.originalPrice > sp.offerPrice
            ) {
              discountPercent = Math.round(
                ((sp.originalPrice - sp.offerPrice) / sp.originalPrice) * 100,
              );
            }

            finalProducts.push({
              id: `${offer._id?.toString()}_${sp.productId || sp._id?.toString() || Math.random().toString(36).substring(7)}`,
              type: 'offer',
              title: sp.productName,
              description: offer.description || '',
              category: offer.category,
              imageUrl: sp.imageUrl || '/images/placeholder.webp',
              price:
                sp.offerPrice !== undefined && sp.offerPrice !== null
                  ? sp.offerPrice
                  : null,
              originalPrice:
                sp.originalPrice !== undefined && sp.originalPrice !== null
                  ? sp.originalPrice
                  : null,
              discountPercent,
              merchantId: offer.merchantId,
              storeName:
                (offer.merchant &&
                  (offer.merchant.storeName || offer.merchant.name)) ||
                offer.storeName ||
                offer.merchantName ||
                '',
              merchantName:
                (offer.merchant &&
                  (offer.merchant.storeName || offer.merchant.name)) ||
                offer.storeName ||
                offer.merchantName ||
                '',
              location:
                offer.storeLocation ||
                offer.merchantLocation ||
                offer.location ||
                offer.city ||
                (offer.merchant &&
                  (offer.merchant.storeLocation || offer.merchant.city)) ||
                '',
              storeLocation:
                offer.storeLocation ||
                offer.merchantLocation ||
                offer.location ||
                offer.city ||
                (offer.merchant &&
                  (offer.merchant.storeLocation || offer.merchant.city)) ||
                '',
              startDate: offer.startDate,
              endDate: offer.endDate,
              validUntil: offer.endDate,
              promoTag: offer.promoTag || '',
              offerId: offer._id?.toString() || offer.id,
              recommendationExplainability: explainability,
            });
          }
        }
      } else {
        // Fallback to presenting the offer itself if no specific products are selected
        const p = { ...offer };
        p.id = p.userId ? p.userId.toString() : p._id ? p._id.toString() : p.id;
        p.offerId = p._id?.toString() || p.id;
        p.merchantId = p.merchantId || p.userId;
        const resolvedStoreName =
          (p.merchant &&
            (p.merchant.storeName || p.merchant.name)) ||
          p.storeName ||
          p.merchantName ||
          '';
        p.storeName = resolvedStoreName;
        p.merchantName = resolvedStoreName;
        // For merchant/shop type items, use the store's profile photo or shop photo document
        const isMerchantType = p.type === 'merchant' || p.type === 'shop';
        const merchantImage = isMerchantType
          ? (p.profilePhoto ||
             p.documents?.businessDocs?.['Shop Photo'] ||
             p.documents?.businessDocs?.['shop_photo'] ||
             p.bannerPhoto ||
             null)
          : null;
        p.type = p.type || 'offer';
        // Use store banner/photo for merchant cards; offer imageUrl for deal cards
        p.imageUrl =
          merchantImage ||
          p.imageUrl ||
          (p.images && p.images[0]) ||
          '/images/placeholder.webp';
        // For merchant cards set the title to their store name
        if (isMerchantType) {
          p.title = p.storeName || p.merchantName || p.title || 'View Store';
        }
        p.badge = p.promoTag || null;
        p.price = p.price ?? p.offerPrice ?? p.discountedPrice ?? null;
        p.originalPrice = p.originalPrice ?? null;
        if (p.price && p.originalPrice && p.originalPrice > p.price) {
          p.discountPercent = Math.round(
            ((p.originalPrice - p.price) / p.originalPrice) * 100,
          );
        } else {
          p.discountPercent = p.discountPercent || p.discount || 0;
        }
        p.location =
          offer.storeLocation ||
          offer.merchantLocation ||
          offer.location ||
          offer.city ||
          (p.merchant && (p.merchant.storeLocation || p.merchant.city)) ||
          '';
        p.storeLocation = p.location;
        p.validUntil = p.endDate;
        p.recommendationExplainability = explainability;
        finalProducts.push(p);
      }

    }

    return finalProducts;
  }
}
