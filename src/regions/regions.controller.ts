import { Controller, Get, Query } from '@nestjs/common';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('search')
  async searchRegions(
    @Query('q') query: string,
    @Query('scale') scale: string,
    @Query('mode') mode: string,
  ) {
    // scale: 'Town', 'City', 'District' (banner mode)
    // mode: 'ad' (Choja ad mode — returns adDailyRates per template)
    return this.regionsService.searchLocations(query, scale, mode);
  }
}
