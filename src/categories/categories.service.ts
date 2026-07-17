import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.categoryModel.countDocuments();
    if (count < 10) {
      console.log('Seeding full initial categories from legacy frontend...');
      await this.categoryModel.deleteMany({}); // clear small test seed
      
      const legacyNames = [
        "Education", "Vehicle", "Property", "Employment", "Mobiles", 
        "Electronics & Home Appliances", "Matrimonial", "Business", "Astrology", 
        "Health & Wellness", "Lost & Found", "Service", "Personal", "Pets", 
        "Public Notice", "Travel", "Furniture", "Greetings & Tributes", "Other",
        "Food & Restaurants", "Home Services", "Beauty & Wellness", "Healthcare & Medical",
        "Hotels & Accommodation", "Shopping & Retail", "Education & Training",
        "Real Estate", "Events & Entertainment", "Professional Services",
        "Automotive Services", "Home Improvement", "Fitness & Sports", 
        "Daily Needs & Utilities", "Local Businesses & Vendors"
      ];
      
      const seeds = legacyNames.map(name => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        parent: 'None (Root Category)',
        status: 'Active',
        featured: false,
        listings: Math.floor(Math.random() * 500)
      }));

      // Add Subcategories specifically requested (Vehicle/Property Rent/Buy)
      seeds.push(
        { name: 'Vehicle Rent', slug: 'vehicle-rent', parent: 'Vehicle', status: 'Active', featured: false, listings: 45 },
        { name: 'Vehicle Buy', slug: 'vehicle-buy', parent: 'Vehicle', status: 'Active', featured: false, listings: 120 },
        { name: 'Property Rent', slug: 'property-rent', parent: 'Property', status: 'Active', featured: false, listings: 300 },
        { name: 'Property Buy', slug: 'property-buy', parent: 'Property', status: 'Active', featured: false, listings: 450 }
      );
      
      await this.categoryModel.insertMany(seeds);
      console.log(`Seeded ${seeds.length} legacy categories successfully.`);
    }
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoryModel.findOne({ name: createCategoryDto.name }).exec();
    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }
    const createdCategory = new this.categoryModel(createCategoryDto);
    return createdCategory.save();
  }

  async findAll(): Promise<Category[]> {
    return this.categoryModel.find().exec();
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const existingCategory = await this.categoryModel
      .findByIdAndUpdate(id, updateCategoryDto, { new: true })
      .exec();
    if (!existingCategory) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return existingCategory;
  }

  async remove(id: string): Promise<Category> {
    const deletedCategory = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!deletedCategory) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return deletedCategory;
  }

  // Generate tree format for frontend
  async getCategoryTree(): Promise<any> {
    const categories = await this.findAll();
    
    // Simple tree logic - assuming max 2 levels for now (Root -> Child)
    const roots = categories.filter(c => !c.parent || c.parent === 'None (Root Category)');
    
    return roots.map(root => {
      const children = categories.filter(c => c.parent === root.name);
      return {
        label: root.name,
        products: children.map(c => c.name),
      };
    });
  }

  // Get formatted stats similar to old aggregated endpoint
  async getStats(): Promise<any> {
    const categories = await this.findAll();
    
    const active = categories.filter(c => c.status === 'Active');
    const hidden = categories.filter(c => c.status === 'Hidden');
    
    // Basic root vs subcategory distinction
    const roots = categories.filter(c => !c.parent || c.parent === 'None (Root Category)');
    const subs = categories.filter(c => c.parent && c.parent !== 'None (Root Category)');
    
    const tree = await this.getCategoryTree();
    
    const rows = categories.map((c: any) => ({
      _id: c._id,
      name: c.name,
      parent: c.parent || 'None (Root Category)',
      listings: c.listings || 0,
      status: c.status,
      featured: c.featured,
      slug: c.slug,
      lastUpdated: c['updatedAt'] || new Date(),
    }));

    return {
      summary: {
        totalCategories: categories.length,
        activeCategories: active.length,
        subcategories: subs.length,
        disabledHidden: hidden.length,
      },
      tree,
      rows,
      totalRows: categories.length,
    };
  }
}
