import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Ad } from '../ads/schemas/category-schemas/ad.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Ad.name) private adModel: Model<any>
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const createdCategory = new this.categoryModel(createCategoryDto);
    return createdCategory.save();
  }

  async findAll() {
    const categories = await this.categoryModel.find().lean().exec();
    
    // Get listing counts for each category
    const adCounts = await this.adModel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).exec();

    const countMap = {};
    adCounts.forEach(c => {
      countMap[c._id] = c.count;
    });

    let activeCategories = 0;
    let hiddenCategories = 0;
    let subcategories = 0;

    const mappedRows = categories.map(cat => {
      if (cat.status === 'Active') activeCategories++;
      else hiddenCategories++;
      if (cat.parent && cat.parent !== '-') subcategories++;

      return {
        ...cat,
        listings: countMap[cat.name] || 0
      };
    });

    return {
      summary: {
        totalCategories: categories.length,
        activeCategories,
        subcategories,
        disabledHidden: hiddenCategories
      },
      rows: mappedRows,
      tree: [] // Can be built based on parent-child relations if needed
    };
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const updatedCategory = await this.categoryModel
      .findByIdAndUpdate(id, updateCategoryDto, { new: true })
      .exec();
    if (!updatedCategory) {
      throw new NotFoundException('Category not found');
    }
    return updatedCategory;
  }

  async remove(id: string): Promise<Category> {
    const deletedCategory = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!deletedCategory) {
      throw new NotFoundException('Category not found');
    }
    return deletedCategory;
  }
}