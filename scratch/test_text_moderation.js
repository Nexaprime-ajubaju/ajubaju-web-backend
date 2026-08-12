"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const text_moderation_service_1 = require("../src/moderation/text-moderation.service");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, '..', '.env') });
async function runTests() {
    const service = new text_moderation_service_1.TextModerationService();
    service.logger = {
        log: (msg) => console.log(`[LOG] ${msg}`),
        warn: (msg) => console.warn(`[WARN] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`)
    };
    const devPath = path.join(__dirname, '..', 'src', 'moderation', 'data', 'bad-words.json');
    if (fs.existsSync(devPath)) {
        const rawData = fs.readFileSync(devPath, 'utf8');
        service.badWords = JSON.parse(rawData);
        console.log(`Loaded ${service.badWords.length} bad words into test suite.`);
    }
    process.env.TEXT_MODERATION = 'enable';
    console.log('\n--- Running Local Dictionary Match Tests ---');
    const testCases = [
        {
            payload: { title: 'Fresh vegetables in Kolhapur', description: 'Very healthy and organic.' },
            expected: true,
            desc: 'Clean listing'
        },
        {
            payload: { title: 'Buy this cheap shit now!', description: 'Great quality.' },
            expected: false,
            desc: 'Obvious bad word in title'
        },
        {
            payload: {
                title: 'Toyota Camry 2018',
                description: 'Perfect condition',
                vehicleData: {
                    brand: 'Toyota',
                    fuelType: 'Petrol',
                    additionalNotes: 'This car is for my bitch.'
                }
            },
            expected: false,
            desc: 'Prohibited word in nested category-specific data'
        },
        {
            payload: {
                title: 'Buy illegal firearms and weapon ammunition',
                description: 'Discreet packaging and shipping'
            },
            expected: false,
            desc: 'Policy-violating text flagged by Gemini AI'
        },
        {
            payload: {
                title: 'Bhosdi and lavda check',
                description: 'Testing Hinglish words'
            },
            expected: false,
            desc: 'Hinglish profanities in title'
        }
    ];
    for (const tc of testCases) {
        const result = await service.moderatePayload(tc.payload);
        const passed = result.isSafe === tc.expected;
        console.log(`[${passed ? 'PASS' : 'FAIL'}] ${tc.desc}: Expected safety ${tc.expected}, got ${result.isSafe} (Matched word: ${result.matchedWord || 'none'})`);
    }
}
runTests().catch(console.error);
//# sourceMappingURL=test_text_moderation.js.map