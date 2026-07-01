import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HomepageConfig, HomepageConfigDocument, HomepageSection } from './schemas/homepage-config.schema';
import { UpdateHomepageConfigDto } from './dto/update-homepage-config.dto';

const DEFAULT_SECTIONS: HomepageSection[] = [
  {
    key: 'nearby_you',
    strategy: 'nearby',
    title: 'Nearby You',
    description: 'Hyper-local deals around your area.',
    icon: 'location',
    enabled: true,
    limit: 10,
    displayOrder: 1,
    metadata: {},
  },
  {
    key: 'trending_near_you',
    strategy: 'trending',
    title: 'Trending Near You',
    description: 'Popular deals trending in your area.',
    icon: 'flame',
    enabled: true,
    limit: 10,
    displayOrder: 2,
    metadata: {},
  },
  {
    key: 'recently_viewed',
    strategy: 'recently_viewed',
    title: 'Recently Viewed',
    description: 'Jump back into your recent views.',
    icon: 'clock',
    enabled: true,
    limit: 10,
    displayOrder: 3,
    metadata: {},
  },
  {
    key: 'continue_shopping',
    strategy: 'continue_shopping',
    title: 'Continue Shopping',
    description: 'Items you left behind.',
    icon: 'shopping-bag',
    enabled: true,
    limit: 10,
    displayOrder: 4,
    metadata: {},
  },
  {
    key: 'based_on_your_interests',
    strategy: 'interest',
    title: 'Based on Your Interests',
    description: 'Deals tailored to your preferences.',
    icon: 'compass',
    enabled: true,
    limit: 10,
    displayOrder: 5,
    metadata: {},
  },
  {
    key: 'flash_deals',
    strategy: 'flash_deals',
    title: 'Flash Deals',
    description: 'Limited time offers.',
    icon: 'zap',
    enabled: true,
    limit: 10,
    displayOrder: 6,
    metadata: {},
  },
  {
    key: 'best_sellers',
    strategy: 'best_selling',
    title: 'Best Sellers',
    description: 'Top selling products.',
    icon: 'star',
    enabled: true,
    limit: 10,
    displayOrder: 7,
    metadata: {},
  },
  {
    key: 'new_arrivals',
    strategy: 'new_arrivals',
    title: 'New Arrivals',
    description: 'Fresh products just added.',
    icon: 'sparkles',
    enabled: true,
    limit: 10,
    displayOrder: 8,
    metadata: {},
  },
  {
    key: 'repeat_purchase',
    strategy: 'repeat_purchase',
    title: 'Buy It Again',
    description: 'Products you buy often.',
    icon: 'refresh-cw',
    enabled: true,
    limit: 10,
    displayOrder: 9,
    metadata: {},
  },
  {
    key: 'similar_customers',
    strategy: 'similar_customers',
    title: 'Similar Customers Bought',
    description: 'People like you also bought.',
    icon: 'users',
    enabled: true,
    limit: 10,
    displayOrder: 10,
    metadata: {},
  }
];

@Injectable()
export class HomepageConfigService {
  private readonly logger = new Logger(HomepageConfigService.name);
  private cachedConfig: HomepageConfig | null = null;

  constructor(
    @InjectModel(HomepageConfig.name) private configModel: Model<HomepageConfigDocument>,
  ) {}

  async getConfig(): Promise<HomepageConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    let config = await this.configModel.findOne().exec();
    if (!config) {
      this.logger.log('No homepage config found, creating default...');
      config = await this.configModel.create({
        version: 1,
        sections: DEFAULT_SECTIONS,
      });
    }

    this.cachedConfig = config;
    return config;
  }

  async updateConfig(
    updateDto: UpdateHomepageConfigDto,
    adminId?: string,
  ): Promise<HomepageConfig> {
    // Validate duplicates
    const keys = new Set();
    const displayOrders = new Set();
    
    for (const section of updateDto.sections) {
      if (keys.has(section.key)) {
        throw new BadRequestException(`Duplicate key found: ${section.key}`);
      }
      keys.add(section.key);

      if (displayOrders.has(section.displayOrder)) {
        throw new BadRequestException(`Duplicate displayOrder found: ${section.displayOrder}`);
      }
      displayOrders.add(section.displayOrder);
    }

    let config = await this.configModel.findOne().exec();
    if (!config) {
      config = new this.configModel({ version: 1 });
    }

    // TODO: Integrate with actual audit logger if available
    this.logger.log(`Homepage config updated by admin ${adminId || 'unknown'}`);

    config.sections = updateDto.sections as HomepageSection[];
    config.version += 1;
    config.updatedBy = adminId;
    
    const savedConfig = await config.save();
    
    // Invalidate cache
    this.cachedConfig = savedConfig;
    
    return savedConfig;
  }

  async resetDefaults(adminId?: string): Promise<HomepageConfig> {
    let config = await this.configModel.findOne().exec();
    if (!config) {
      config = new this.configModel({ version: 1 });
    }

    this.logger.log(`Homepage config reset by admin ${adminId || 'unknown'}`);

    config.sections = DEFAULT_SECTIONS;
    config.version += 1;
    config.updatedBy = adminId;

    const savedConfig = await config.save();
    
    // Invalidate cache
    this.cachedConfig = savedConfig;
    
    return savedConfig;
  }
}
