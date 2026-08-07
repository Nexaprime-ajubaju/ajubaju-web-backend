const { TextModerationService } = require('../src/moderation/text-moderation.service');
const fs = require('fs');
const path = require('path');

async function runTests() {
  const service = new TextModerationService();
  
  // Mock dependencies
  service.logger = {
    log: (msg) => console.log(`[LOG] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
  };

  // Mock onModuleInit to load bad words manually in dev environment
  const devPath = path.join(__dirname, '..', 'src', 'moderation', 'data', 'bad-words.json');
  if (fs.existsSync(devPath)) {
    const rawData = fs.readFileSync(devPath, 'utf8');
    service.badWords = JSON.parse(rawData);
    console.log(`Loaded ${service.badWords.length} bad words into test suite.`);
  }

  // Set test environmental variables
  process.env.TEXT_MODERATION = 'enable';
  // Note: Gemini fallback will be skipped since GEMINI_API_KEY is not set.

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
          additionalNotes: 'Don\'t buy this crap.'
        }
      },
      expected: false,
      desc: 'Prohibited word in nested category-specific data'
    }
  ];

  for (const tc of testCases) {
    const result = await service.moderatePayload(tc.payload);
    const passed = result.isSafe === tc.expected;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${tc.desc}: Expected safety ${tc.expected}, got ${result.isSafe} (Matched word: ${result.matchedWord || 'none'})`);
  }
}

runTests().catch(console.error);
