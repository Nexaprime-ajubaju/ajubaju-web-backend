import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Ad } from '../ads/schemas/category-schemas/ad.schema';
import { OfferPromotion } from '../offers/schemas/offer-promotion.schema';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY = 'golo:categories:all';

  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Ad.name) private adModel: Model<any>,
    @InjectModel(OfferPromotion.name) private offerModel: Model<any>,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  private async invalidateCache() {
    if (this.redisService) {
      try {
        await this.redisService.del(this.CACHE_KEY);
      } catch (e) {
        // Ignore cache deletion error
      }
    }
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const createdCategory = new this.categoryModel(createCategoryDto);
    const result = await createdCategory.save();
    await this.invalidateCache();
    return result;
  }

  async findAll() {
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<any>(this.CACHE_KEY);
        if (cached) return cached;
      } catch (e) {
        // Safe fallback
      }
    }

    const categories = await this.categoryModel.find().lean().exec();

    // Get listing counts for each category
    const [adCounts, offerCounts] = await Promise.all([
      this.adModel
        .aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])
        .exec()
        .catch(() => []),
      this.offerModel
        .aggregate([
          { $group: { _id: '$businessCategory', count: { $sum: 1 } } },
        ])
        .exec()
        .catch(() => []),
    ]);

    const adCountMap = {};
    (adCounts || []).forEach((c) => {
      adCountMap[c._id] = c.count;
    });

    const offerCountMap = {};
    (offerCounts || []).forEach((c) => {
      offerCountMap[c._id] = c.count;
    });

    let activeCategories = 0;
    let hiddenCategories = 0;
    let subcategories = 0;

    const mappedRows = categories.map((cat) => {
      if (cat.status === 'Active') activeCategories++;
      else hiddenCategories++;
      if (cat.parent && cat.parent !== '-') subcategories++;

      const listingsCount =
        cat.platform === 'golo'
          ? offerCountMap[cat.name] || 0
          : adCountMap[cat.name] || 0;

      return {
        ...cat,
        listings: listingsCount,
      };
    });

    const response = {
      summary: {
        totalCategories: categories.length,
        activeCategories,
        subcategories,
        disabledHidden: hiddenCategories,
      },
      rows: mappedRows,
      tree: [], // Can be built based on parent-child relations if needed
    };

    if (this.redisService) {
      try {
        await this.redisService.set(this.CACHE_KEY, response, 3600); // 1 hour TTL
      } catch (e) {
        // Ignore cache write failure
      }
    }

    return response;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const updatedCategory = await this.categoryModel
      .findByIdAndUpdate(id, updateCategoryDto, { new: true })
      .exec();
    if (!updatedCategory) {
      throw new NotFoundException('Category not found');
    }
    await this.invalidateCache();
    return updatedCategory;
  }

  async remove(id: string): Promise<Category> {
    const deletedCategory = await this.categoryModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedCategory) {
      throw new NotFoundException('Category not found');
    }
    await this.invalidateCache();
    return deletedCategory;
  }
}
