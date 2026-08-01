import { Controller, Get, Query } from '@nestjs/common';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('search')
  async searchRegions(
    @Query('q') query: string,
    @Query('scale') scale: string
  ) {
    // scale should be 'Town', 'City', or 'District'
    return this.regionsService.searchLocations(query, scale);
  }
}
