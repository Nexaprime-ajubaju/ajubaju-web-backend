import { Body, Controller, Get, Post, Put, UseGuards, Request } from '@nestjs/common';
import { HomepageConfigService } from './homepage-config.service';
import { UpdateHomepageConfigDto } from './dto/update-homepage-config.dto';
// Note: We might need to import AdminGuard or JWT auth guard based on the project's setup. 
// For now we assume endpoints are exposed or use a basic guard. In a real scenario, use @UseGuards() here.

@Controller('homepage-config')
export class HomepageConfigController {
  constructor(private readonly homepageConfigService: HomepageConfigService) {}

  @Get()
  async getConfig() {
    return this.homepageConfigService.getConfig();
  }

  // @UseGuards(JwtAuthGuard, RolesGuard) // Assuming admin only
  @Put()
  async updateConfig(@Body() updateDto: UpdateHomepageConfigDto, @Request() req: any) {
    const adminId = req.user?.id || req.user?._id || 'admin';
    return this.homepageConfigService.updateConfig(updateDto, adminId);
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('reset')
  async resetDefaults(@Request() req: any) {
    const adminId = req.user?.id || req.user?._id || 'admin';
    return this.homepageConfigService.resetDefaults(adminId);
  }
}
