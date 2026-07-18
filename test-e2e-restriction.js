"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const moderation_security_service_1 = require("./src/security/moderation/moderation-security.service");
const mongoose_1 = require("@nestjs/mongoose");
const merchant_schema_1 = require("./src/users/schemas/merchant.schema");
const merchant_moderation_attempt_schema_1 = require("./src/security/schemas/merchant-moderation-attempt.schema");
const notification_schema_1 = require("./src/users/schemas/notification.schema");
const user_schema_1 = require("./src/users/schemas/user.schema");
async function bootstrap() {
    console.log('Starting E2E Restriction Test...');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const moderationService = app.get(moderation_security_service_1.ModerationSecurityService);
    const merchantModel = app.get((0, mongoose_1.getModelToken)(merchant_schema_1.Merchant.name));
    const attemptModel = app.get((0, mongoose_1.getModelToken)(merchant_moderation_attempt_schema_1.MerchantModerationAttempt.name));
    const notificationModel = app.get((0, mongoose_1.getModelToken)(notification_schema_1.Notification.name));
    const userModel = app.get((0, mongoose_1.getModelToken)(user_schema_1.User.name));
    const merchantId = '69e8a82865a19fe7680b9fef';
    await merchantModel.updateOne({ userId: merchantId }, { $set: {
            'security.contentUploadRestrictionUntil': null,
            'security.restrictionCount30Days': 0,
            'security.lastRestrictionAt': null
        }
    });
    await attemptModel.deleteMany({ merchantId });
    await notificationModel.deleteMany({ type: 'admin_warning' });
    console.log('--- TEST 1: First Restriction (3 hours) ---');
    for (let i = 1; i <= 5; i++) {
        try {
            await moderationService.handleFailure(merchantId, 'new_offer', 'test-hash-' + i, 'Test Failure');
            console.log(`Attempt ${i}: Logged failure.`);
        }
        catch (e) {
            console.log(`Attempt ${i}: Exception -> ${e.message}`);
        }
    }
    let merchant = await merchantModel.findOne({ userId: merchantId }).exec();
    console.log('Restriction Count 30 Days:', merchant?.security?.restrictionCount30Days);
    console.log('Restricted Until:', merchant?.security?.contentUploadRestrictionUntil);
    console.log('Last Restriction At:', merchant?.security?.lastRestrictionAt);
    let notifications = await notificationModel.find({ type: 'admin_warning' }).exec();
    console.log(`Admin Notifications Created: ${notifications.length}`);
    console.log('\n--- TEST 2: Grace Period (1 Failure After Restriction) ---');
    try {
        await moderationService.handleFailure(merchantId, 'new_offer', 'test-hash-after', 'Test Failure After Restriction');
    }
    catch (e) {
        console.log(`Attempt 6: Exception -> ${e.message}`);
    }
    merchant = await merchantModel.findOne({ userId: merchantId }).exec();
    console.log('Restriction Count 30 Days after 1 failure:', merchant?.security?.restrictionCount30Days);
    console.log('\n--- SIMULATING TIME PASSING (Restriction Expires) ---');
    await merchantModel.updateOne({ userId: merchantId }, { $set: { 'security.contentUploadRestrictionUntil': new Date(Date.now() - 10000) } });
    console.log('\n--- TEST 3: Escalation (12 hours) ---');
    for (let i = 1; i <= 4; i++) {
        try {
            await moderationService.handleFailure(merchantId, 'new_offer', 'test-hash-2nd-' + i, 'Test Failure 2');
            console.log(`2nd Round Attempt ${i}: Logged failure.`);
        }
        catch (e) {
            console.log(`2nd Round Attempt ${i}: Exception -> ${e.message}`);
        }
    }
    merchant = await merchantModel.findOne({ userId: merchantId }).exec();
    console.log('Restriction Count 30 Days:', merchant?.security?.restrictionCount30Days);
    console.log('Restricted Until (Should be 12 hours from now):', merchant?.security?.contentUploadRestrictionUntil);
    await app.close();
}
bootstrap();
//# sourceMappingURL=test-e2e-restriction.js.map