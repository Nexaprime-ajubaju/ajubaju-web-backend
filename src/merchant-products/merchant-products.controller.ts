import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

interface CurrentUserPayload {
  id: string;
  email: string;
  role: string;
}

@Controller('merchant/products')
export class MerchantProductsController {
  constructor(
    private readonly merchantProductsService: MerchantProductsService,
  ) {}

  @Get('public/:merchantId')
  async listPublic(
    @Param('merchantId') merchantId: string,
    @Query() query: ListMerchantProductsDto,
  ) {
    return this.merchantProductsService.listProductsByMerchantId(
      merchantId,
      query,
    );
  }

  @Get('public/item/:productId')
  async getPublicProduct(@Param('productId') productId: string) {
    return this.merchantProductsService.getPublicProduct(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMerchantProductDto,
  ) {
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
}
