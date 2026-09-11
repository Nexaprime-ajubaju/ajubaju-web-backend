import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import { MerchantProductsService } from './merchant-products.service';
import { RedisService } from '../common/services/redis.service';

interface CurrentUserPayload {
  id: string;
  email: string;
  role: string;
}

@Controller('merchant/products')
export class MerchantProductsController {
  constructor(
    private readonly merchantProductsService: MerchantProductsService,
    private readonly redisService: RedisService,
  ) {}

  @Get('public/search/global')
  async searchGlobalProducts(
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) return { success: true, data: [] };
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10)));
    return this.merchantProductsService.searchGlobalProducts(
      query,
      pageNum,
      limitNum,
    );
  }

  @Get('public/:merchantId')
  async listPublic(
    @Param('merchantId') merchantId: string,
    @Query() query: ListMerchantProductsDto,
  ) {
    const cacheKey = `merchant:products:public:${merchantId}:${JSON.stringify(query)}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.merchantProductsService.listProductsByMerchantId(
      merchantId,
      query,
    );
    if (result && result.success) {
      await this.redisService.set(cacheKey, result, 60);
    }
    return result;
  }

  @Get('public/item/:productId')
  async getPublicProduct(@Param('productId') productId: string) {
    return this.merchantProductsService.getPublicProduct(productId);
  }

  @Post('public/item/:productId/view')
  async incrementViewCount(@Param('productId') productId: string) {
    return this.merchantProductsService.incrementViewCount(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMerchantProductDto,
  ) {
    console.log('RECEIVED DTO FOR CREATING PRODUCT:', dto);
    return this.merchantProductsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListMerchantProductsDto,
  ) {
    return this.merchantProductsService.listMyProducts(user.id, query);
  }

  @Get(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async getOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
  ) {
    return this.merchantProductsService.getProduct(user.id, productId);
  }

  @Put(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async updateOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Body() dto: UpdateMerchantProductDto,
  ) {
    return this.merchantProductsService.updateProduct(user.id, productId, dto);
  }

  @Delete(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async deleteOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
  ) {
    return this.merchantProductsService.deleteProduct(user.id, productId);
  }
  @Patch(':productId/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async toggleActive(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.merchantProductsService.toggleProductActiveStatus(
      productId,
      user.id,
      isActive,
    );
  }

  @Post('select-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async selectActive(
    @CurrentUser() user: CurrentUserPayload,
    @Body('productIds') productIds: string[],
  ) {
    return this.merchantProductsService.finalizeActiveProducts(
      user.id,
      productIds,
    );
  }
}
