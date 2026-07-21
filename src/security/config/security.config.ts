export const SecurityConfig = {
  offerFailureLimit: 5, // Keep for backward compatibility if needed, but we rely on context now
  singleImageFailureLimit: 3,
  multiImageFailureLimit: 6,
  rollingWindowHours: 24,
  offerLockHours: 3,
  merchantRestrictionHours: [3, 8, 24],
  maxDailyModerationCalls: 100,
};
