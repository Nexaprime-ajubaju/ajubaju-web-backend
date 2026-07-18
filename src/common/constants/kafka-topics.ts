export const KAFKA_TOPICS = {
  // Ad Commands (Requests)
  AD_CREATE: 'ad.create',
  AD_UPDATE: 'ad.update',
  AD_DELETE: 'ad.delete',
  AD_GET: 'ad.get',
  AD_GET_BY_CATEGORY: 'ad.get.by.category',
  AD_GET_BY_USER: 'ad.get.by.user',
  AD_SEARCH: 'ad.search',
  AD_GET_NEARBY: 'ad.get.nearby',

  // Ad Events (Responses/Notifications)
  AD_CREATED: 'ad.created',
  AD_UPDATED: 'ad.updated',
  AD_DELETED: 'ad.deleted',
  AD_VIEWED: 'ad.viewed',
  AD_EXPIRED: 'ad.expired',
  AD_PROMOTED: 'ad.promoted',

  // Merchant Product Events
  MERCHANT_PRODUCT_CREATED: 'merchant.product.created',
  MERCHANT_PRODUCT_DELETED: 'merchant.product.deleted',

  // Banner Promotion Events
  BANNER_PROMOTION_SUBMITTED: 'banner.promotion.submitted',
  BANNER_PROMOTION_REVIEWED: 'banner.promotion.reviewed',
  BANNER_PROMOTION_PAID: 'banner.promotion.paid',
  BANNER_PROMOTION_DELETED: 'banner.promotion.deleted',
  // Offer Promotion Events (separate topic namespace)
  OFFER_PROMOTION_SUBMITTED: 'offer.promotion.submitted',
  OFFER_PROMOTION_REVIEWED: 'offer.promotion.reviewed',
  OFFER_PROMOTION_PAID: 'offer.promotion.paid',
  OFFER_PROMOTION_DELETED: 'offer.promotion.deleted',

  // Responses
  AD_RESPONSE: 'ad.response',
  AD_ERROR: 'ad.error',

  // Dead Letter Queue
  AD_DLQ: 'ad.dlq',

  // User Events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged.in',
  USER_LOGGED_OUT: 'user.logged.out',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Ad-User integration
  USER_ADS_FETCHED: 'user.ads.fetched',
  USER_ADS_CREATED: 'user.ads.created',

  // Payment Events
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_WEBHOOK_PROCESSED: 'payment.webhook.processed',

  // Ad Reporting & Moderation
  AD_REPORT_SUBMITTED: 'ad.report.submitted',
  AD_AUTO_DISABLED: 'ad.auto.disabled',
  AD_REVIEW_REQUEST: 'ad.review.request',

  // Chat Commands
  CHAT_START_CONVERSATION: 'chat.start.conversation',
  CHAT_LIST_CONVERSATIONS: 'chat.list.conversations',
  CHAT_LIST_MESSAGES: 'chat.list.messages',
  CHAT_SEND_MESSAGE: 'chat.send.message',
  CHAT_DELETE_CONVERSATION: 'chat.delete.conversation',

  // Chat Events
  CHAT_CONVERSATION_STARTED: 'chat.conversation.started',
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  CHAT_CONVERSATION_DELETED: 'chat.conversation.deleted',

  // Call Commands
  CALL_GET_HISTORY: 'call.get.history',
  CALL_GET_BY_ID: 'call.get.by.id',
  CALL_CREATE_INVITE: 'call.create.invite',
  CALL_ACCEPT: 'call.accept',
  CALL_REJECT: 'call.reject',
  CALL_END: 'call.end',

  // Call Events
  CALL_INVITED: 'call.invited',
  CALL_ACCEPTED: 'call.accepted',
  CALL_REJECTED: 'call.rejected',
  CALL_ENDED: 'call.ended',

  // Analytics Commands
  ANALYTICS_DEVICE_BREAKDOWN: 'analytics.device.breakdown',
  ANALYTICS_TOP_REGIONS: 'analytics.top.regions',
  ANALYTICS_TOP_PAGES: 'analytics.top.pages',
  ANALYTICS_EVENTS: 'analytics.events',
  ANALYTICS_RECENT_ACTIVITY: 'analytics.recent.activity',

  // Audit Logs Commands
  AUDIT_LOG_CREATE: 'audit.log.create',
  AUDIT_LOG_LIST: 'audit.log.list',

  // Audit Logs Events
  AUDIT_LOG_CREATED: 'audit.log.created',

  // Reports Commands
  REPORTS_STATUS: 'reports.status',

  // Voucher Commands
  VOUCHER_CLAIM: 'voucher.claim',
  VOUCHER_GET_MY: 'voucher.get.my',
  VOUCHER_GET_BY_ID: 'voucher.get.by.id',
  VOUCHER_VERIFY: 'voucher.verify',
  VOUCHER_REDEEM: 'voucher.redeem',
  VOUCHER_GENERATE_CODE: 'voucher.generate.code',

  // Voucher Events
  VOUCHER_CLAIMED: 'voucher.claimed',
  VOUCHER_VERIFIED: 'voucher.verified',
  VOUCHER_REDEEMED: 'voucher.redeemed',
  VOUCHER_SHARED: 'voucher.shared',

  // Orders Commands/Events
  ORDER_GET_MERCHANT: 'order.get.merchant',
  ORDER_GET_STATS: 'order.get.stats',
  ORDER_UPDATE_STATUS: 'order.update.status',
  ORDER_STATUS_UPDATED: 'order.status.updated',

  // Reviews Commands/Events
  REVIEW_GET_MERCHANT: 'review.get.merchant',
  REVIEW_GET_STATS: 'review.get.stats',
  REVIEW_UPDATE_STATUS: 'review.update.status',
  REVIEW_STATUS_UPDATED: 'review.status.updated',

  // Merchant Dashboard Commands/Events
  MERCHANT_DASHBOARD_SUMMARY: 'merchant.dashboard.summary',
  MERCHANT_DASHBOARD_SUMMARY_GENERATED: 'merchant.dashboard.summary.generated',
};
