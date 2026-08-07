import { TextModerationService } from '../src/moderation/text-moderation.service';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function runTests() {
  const service = new TextModerationService();
  
  // Mock logger
  (service as any).logger = {
    log: (msg: string) => console.log(`[LOG] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`)
  };

  // Load bad words list manually for test
  const devPath = path.join(__dirname, '..', 'src', 'moderation', 'data', 'bad-words.json');
  if (fs.existsSync(devPath)) {
    const rawData = fs.readFileSync(devPath, 'utf8');
    (service as any).badWords = JSON.parse(rawData);
    console.log(`Loaded ${(service as any).badWords.length} bad words into test suite.`);
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
