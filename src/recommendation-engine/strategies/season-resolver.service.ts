import { Injectable } from '@nestjs/common';

@Injectable()
export class SeasonResolverService {
  /**
   * Returns tags for the current season, month, and upcoming festivals.
   */
  getCurrentTags(): string[] {
    const tags = [];
    const now = new Date();
    const month = now.getMonth(); // 0-indexed

    // Basic Indian seasons
    if (month >= 2 && month <= 5) tags.push('summer');
    else if (month >= 6 && month <= 9) tags.push('monsoon');
    else tags.push('winter');

    // Add current month name
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    tags.push(monthNames[month]);

    // Simple festival logic (mocked logic for static dates)
    // E.g., if October or November, add diwali
    if (month === 9 || month === 10) tags.push('diwali');
    if (month === 11 || month === 0) tags.push('christmas', 'new_year');

    return tags;
  }
}
