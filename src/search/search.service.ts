import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { MerchantProduct, MerchantProductDocument } from '../merchant-products/schemas/merchant-product.schema';
import { OfferPromotion, OfferPromotionDocument } from '../offers/schemas/offer-promotion.schema';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(MerchantProduct.name) private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
  ) {}

  async unifiedSearch(query: string, type: string, page: number, limit: number) {
    const regex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;

    // 1. Find directly matching items to extract their merchantIds
    const [matchingMerchants, matchingProducts, matchingOffers] = await Promise.all([
      this.merchantModel.find({
        $or: [{ storeName: { $regex: regex } }, { name: { $regex: regex } }, { category: { $regex: regex } }],
      }).select('_id merchantId').lean().exec(),
      this.merchantProductModel.find({
        $or: [{ productName: { $regex: regex } }, { description: { $regex: regex } }, { category: { $regex: regex } }],
      }).select('merchantId').lean().exec(),
      this.offerModel.find({
        status: 'active',
        $or: [{ title: { $regex: regex } }, { description: { $regex: regex } }],
      }).select('merchantId').lean().exec(),
    ]);

    // 2. Aggregate unique merchantIds
    const merchantIdSet = new Set<string>();
    matchingMerchants.forEach((m: any) => { 
      const id = m.merchantId || (m._id ? m._id.toString() : null);
      if (id) merchantIdSet.add(id); 
    });
    matchingProducts.forEach((p: any) => { if (p.merchantId) merchantIdSet.add(p.merchantId); });
    matchingOffers.forEach((o: any) => { if (o.merchantId) merchantIdSet.add(o.merchantId); });

    const merchantIds = Array.from(merchantIdSet);

    // 3. Prepare response data
    const responseData: any = { merchants: [], products: [], offers: [] };

    // 4. Fetch requested type(s)
    if (type === 'all' || type === 'merchants') {
      // Prioritize direct matches, then others. Simple approach: just fetch all matches by ID
      const merchants = await this.merchantModel.find({
        $or: [
          { merchantId: { $in: merchantIds } },
          { _id: { $in: merchantIds } }
        ]
      }).skip(type === 'all' ? 0 : skip).limit(limit).lean().exec();
      responseData.merchants = merchants;
    }

    if (type === 'all' || type === 'products') {
      const products = await this.merchantProductModel.find({
        merchantId: { $in: merchantIds }
      }).skip(type === 'all' ? 0 : skip).limit(limit).lean().exec();
      responseData.products = products;
    }

    if (type === 'all' || type === 'offers') {
      const offers = await this.offerModel.find({
        merchantId: { $in: merchantIds },
        status: 'active',
      }).skip(type === 'all' ? 0 : skip).limit(limit).lean().exec();
      responseData.offers = offers;
    }

    return {
      success: true,
      data: responseData,
    };
  }
}
