import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { HomepageConfigService } from './homepage-config.service';
import { UpdateHomepageConfigDto } from './dto/update-homepage-config.dto';

@Controller('homepage-config')
export class HomepageConfigController {
  constructor(private readonly homepageConfigService: HomepageConfigService) {}

  @Get()
  async getConfig() {
    return this.homepageConfigService.getConfig();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateConfig(
    @Body() updateDto: UpdateHomepageConfigDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id || req.user?._id || 'admin';
    return this.homepageConfigService.updateConfig(updateDto, adminId);
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resetDefaults(@Request() req: any) {
    const adminId = req.user?.id || req.user?._id || 'admin';
    return this.homepageConfigService.resetDefaults(adminId);
  }
}
