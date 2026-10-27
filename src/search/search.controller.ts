import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(OptionalJwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('unified')
  async getUnifiedSearch(
    @Query('q') query: string,
    @Query('type') type: string = 'all',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('location') location?: string,
    @Query('sessionId') sessionId?: string,
    @Query('strict') strict?: string,
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    if (!query) {
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
      };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const isStrict = strict === 'true' || strict === '1';

    // Save search history in background
    const userId = user?.id || user?._id || user?.userId;
    const resolvedSessionId =
      sessionId ||
      req?.headers?.['x-session-id'] ||
      req?.cookies?.['ajubaju_session'];

    this.searchService
      .saveSearchHistory(userId, resolvedSessionId, query, location)
      .catch(() => {});

    return this.searchService.unifiedSearch(
      query,
      type,
      pageNum,
      limitNum,
      userId,
      resolvedSessionId,
      location,
      isStrict,
    );
  }

  @Post('history')
  async saveSearchHistory(
    @Body() body: { query: string; location?: string; sessionId?: string },
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    const userId = user?.id || user?._id || user?.userId;
    const resolvedSessionId =
      body?.sessionId ||
      req?.headers?.['x-session-id'] ||
      req?.cookies?.['ajubaju_session'];

    const result = await this.searchService.saveSearchHistory(
      userId,
      resolvedSessionId,
      body?.query,
      body?.location,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('history')
  async getSearchHistory(
    @Query('limit') limit: string = '6',
    @Query('sessionId') sessionId?: string,
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    const userId = user?.id || user?._id || user?.userId;
    const resolvedSessionId =
      sessionId ||
      req?.headers?.['x-session-id'] ||
      req?.cookies?.['ajubaju_session'];

    const limitNum = Math.min(20, Math.max(1, parseInt(limit, 10) || 6));
    const data = await this.searchService.getSearchHistory(
      userId,
      resolvedSessionId,
      limitNum,
    );

    return {
      success: true,
      data,
    };
  }

  @Delete('history')
  async deleteSearchHistory(
    @Query('id') id?: string,
    @Query('query') query?: string,
    @Query('sessionId') sessionId?: string,
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    const userId = user?.id || user?._id || user?.userId;
    const resolvedSessionId =
      sessionId ||
      req?.headers?.['x-session-id'] ||
      req?.cookies?.['ajubaju_session'];

    if (id || query) {
      const res = await this.searchService.deleteSearchHistoryItem(
        userId,
        resolvedSessionId,
        id,
        query,
      );
      return res;
    }

    const res = await this.searchService.clearSearchHistory(
      userId,
      resolvedSessionId,
    );
    return res;
  }

  // =========================================================================
  // DEMAND KEYWORDS (Empty / Low Result Searches for Marketing & Sales Team)
  // =========================================================================

  @Get('demand-keywords/stats')
  async getDemandKeywordStats() {
    const stats = await this.searchService.getDemandKeywordStats();
    return {
      success: true,
      data: stats,
    };
  }

  @Get('demand-keywords')
  async getDemandKeywords(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('location') location?: string,
    @Query('minSearches') minSearches?: string,
  ) {
    const result = await this.searchService.getDemandKeywords({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy,
      order,
      status,
      search,
      location,
      minSearches: minSearches ? parseInt(minSearches, 10) : undefined,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Patch('demand-keywords/:id/status')
  async updateDemandKeywordStatus(
    @Param('id') id: string,
    @Body() body: { status?: string; notes?: string; suggestedCategory?: string },
  ) {
    const updated = await this.searchService.updateDemandKeywordStatus(
      id,
      body?.status,
      body?.notes,
      body?.suggestedCategory,
    );

    return {
      success: true,
      data: updated,
    };
  }

  @Delete('demand-keywords/:id')
  async deleteDemandKeyword(@Param('id') id: string) {
    const res = await this.searchService.deleteDemandKeyword(id);
    return res;
  }

  // =========================================================================
  // ZERO-RESULT ANALYTICS & CATALOGUE HEALTH BENCHMARKS
  // =========================================================================

  @Get('analytics/zero-result-rate')
  async getZeroResultAnalytics() {
    const data = await this.searchService.getZeroResultAnalytics();
    return {
      success: true,
      data,
    };
  }

  // =========================================================================
  // USER ITEM DEMAND NOTIFICATIONS ("Notify me when available" / "Request Item")
  // =========================================================================

  @Post('item-demand-request')
  async createItemDemandRequest(
    @Body()
    body: {
      keyword: string;
      originalQuery?: string;
      userContact?: string;
      userName?: string;
      location?: string;
      notes?: string;
      sessionId?: string;
    },
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    const userId = user?.id || user?._id || user?.userId;
    const resolvedSessionId =
      body?.sessionId ||
      req?.headers?.['x-session-id'] ||
      req?.cookies?.['ajubaju_session'];

    const result = await this.searchService.createItemDemandRequest({
      keyword: body.keyword,
      originalQuery: body.originalQuery,
      userId,
      sessionId: resolvedSessionId,
      userContact: body.userContact,
      userName: body.userName,
      location: body.location,
      notes: body.notes,
    });

    return result;
  }

  @Get('item-demand-requests')
  async getItemDemandRequests(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.searchService.getItemDemandRequests({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      status,
      keyword,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Patch('item-demand-requests/:id/status')
  async updateItemDemandRequestStatus(
    @Param('id') id: string,
    @Body() body: { status: any; notes?: string },
  ) {
    const updated = await this.searchService.updateItemDemandRequestStatus(
      id,
      body.status,
      body.notes,
    );

    return {
      success: true,
      data: updated,
    };
  }
}
