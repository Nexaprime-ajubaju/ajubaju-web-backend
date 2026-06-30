import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HomepageConfig, HomepageConfigDocument, HomepageSection } from './schemas/homepage-config.schema';
import { UpdateHomepageConfigDto } from './dto/update-homepage-config.dto';

const DEFAULT_SECTIONS: HomepageSection[] = [
  {
    key: 'nearby_you',
    strategy: 'nearby_you',
    title: 'Nearby You',
    description: 'Hyper-local merchants around your area.',
    icon: 'location',
    enabled: true,
    displayOrder: 1,
    metadata: {},
  },
  {
    key: 'based_on_your_interests',
    strategy: 'interest',
    title: 'Based on Your Interests',
    description: 'Deals tailored to your preferences.',
    icon: 'star',
    enabled: true,
    displayOrder: 2,
    metadata: {},
  },
  {
    key: 'recommended_deals',
    title: 'Recommended Deals',
    description: 'Personalized recommendations for customers.',
    icon: 'star',
    enabled: true,
    displayOrder: 3,
    metadata: {},
  },
  {
    key: 'couple_deals',
    title: 'Couple Deals',
    description: 'Special offers tailored for couples.',
    icon: 'heart',
    enabled: true,
    displayOrder: 4,
    metadata: {},
  },
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
