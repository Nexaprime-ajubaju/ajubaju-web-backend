import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';

@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private productsService: ProductsService) {}

  /**
   * Merchant: Create a new product
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createProduct(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Merchant ${user.id} creating product: ${createProductDto.productName}`,
    );

    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Only merchants can create products');
    }

    try {
      const product = await this.productsService.createProduct(
        user.id,
        createProductDto,
      );

      return {
        success: true,
        message: 'Product created successfully',
        data: product,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error creating product: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to create product',
      );
    }
  }

  /**
   * Merchant: Get all products for the merchant - MUST BE BEFORE :productId
   */
  @Get('merchant')
  @UseGuards(JwtAuthGuard)
  async getMerchantProducts(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() user: any,
  ) {
    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Only merchants can view their products');
    }

    try {
      const pageNum = parseInt(String(page), 10);
      const limitNum = parseInt(String(limit), 10);

      if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
        throw new BadRequestException('Invalid page or limit parameters');
      }

      const skip = (pageNum - 1) * limitNum;
      const { data, total } = await this.productsService.getProductsByMerchant(
        user.id,
        skip,
        limitNum,
      );

      return {
        success: true,
        data,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching merchant products: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to fetch products',
      );
    }
  }

  /**
   * Merchant: Get product statistics - MUST BE BEFORE :productId
   */
  @Get('merchant/stats')
  @UseGuards(JwtAuthGuard)
  async getMerchantStats(@CurrentUser() user: any) {
    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Only merchants can view stats');
    }

    try {
      const stats = await this.productsService.getMerchantProductStats(user.id);

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching stats: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to fetch stats');
    }
  }

  /**
   * Public: Search products by query - MUST BE BEFORE :productId
   */
  @Get('search/:query')
  async searchProducts(
    @Param('query') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const pageNum = Math.max(1, parseInt(page || '1', 10));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10)));
      const products = await this.productsService.searchProducts(query, undefined, pageNum, limitNum);

      return {
        success: true,
        data: products,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error searching products: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to search products',
      );
    }
  }

  /**
   * Public: Get products by category - MUST BE BEFORE :productId
   */
  @Get('category/:category')
  async getProductsByCategory(@Param('category') category: string) {
    try {
      const products =
        await this.productsService.getProductsByCategory(category);

      return {
        success: true,
        data: products,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching by category: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to fetch products',
      );
    }
  }

  /**
   * Public: Get product by ID - MUST BE LAST
   */
  @Get(':productId')
  async getProduct(@Param('productId') productId: string) {
    try {
      const product = await this.productsService.getProductById(productId);

      // Increment view count
      await this.productsService.updateViewCount(productId);

      return {
        success: true,
        data: product,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching product: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to fetch product');
    }
  }

  /**
   * Merchant: Update product
   */
  @Put(':productId')
  @UseGuards(JwtAuthGuard)
  async updateProduct(
    @Param('productId') productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: any,
  ) {
    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Only merchants can update products');
    }

    try {
      const product = await this.productsService.updateProduct(
        productId,
        user.id,
        updateProductDto,
      );

      return {
        success: true,
        message: 'Product updated successfully',
        data: product,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error updating product: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to update product',
      );
    }
  }

  /**
   * Merchant: Delete product
   */
  @Delete(':productId')
  @UseGuards(JwtAuthGuard)
  async deleteProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Only merchants can delete products');
    }

    try {
      const product = await this.productsService.deleteProduct(
        productId,
        user.id,
      );

      return {
        success: true,
        message: 'Product deleted successfully',
        data: product,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error deleting product: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Failed to delete product',
      );
    }
  }
}
