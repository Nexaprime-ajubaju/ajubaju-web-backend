import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('unified')
  async getUnifiedSearch(
    @Query('q') query: string,
    @Query('type') type: string = 'all',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
  ) {
    if (!query) {
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
      };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));

    return this.searchService.unifiedSearch(query, type, pageNum, limitNum);
  }
}
