import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class TextModerationService implements OnModuleInit {
  private readonly logger = new Logger(TextModerationService.name);
  private badWords: string[] = [];

  onModuleInit() {
    try {
      const filePath = path.join(__dirname, 'data', 'bad-words.json');
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        this.badWords = JSON.parse(rawData);
        this.logger.log(
          `Loaded ${this.badWords.length} bad words into local dictionary.`,
        );
      } else {
        // Fallback search path in dev context (src vs dist)
        const devPath = path.join(
          process.cwd(),
          'src',
          'moderation',
          'data',
          'bad-words.json',
        );
        if (fs.existsSync(devPath)) {
          const rawData = fs.readFileSync(devPath, 'utf8');
          this.badWords = JSON.parse(rawData);
          this.logger.log(
            `Loaded ${this.badWords.length} bad words from dev path.`,
          );
        } else {
          this.logger.warn(
            'bad-words.json not found. Local dictionary checks will be bypassed.',
          );
        }
      }
    } catch (err) {
      this.logger.error(
        'Failed to initialize local bad words dictionary:',
        err.message,
      );
    }
  }

  cleanAndNormalize(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ') // Replace punctuation with space
      .replace(/\s+/g, ' ') // Collapse spaces
      .trim();
  }

  checkLocalDictionary(text: string): {
    isSafe: boolean;
    matchedWord?: string;
  } {
    const normalized = this.cleanAndNormalize(text);
    if (!normalized) return { isSafe: true };

    const words = normalized.split(' ');

    for (const badWord of this.badWords) {
      const cleanedBadWord = badWord.toLowerCase().trim();
      if (!cleanedBadWord) continue;

      // Check for exact word matches in the sentence
      if (words.includes(cleanedBadWord)) {
        return { isSafe: false, matchedWord: cleanedBadWord };
      }

      // Check for substring matches if the bad word is longer (e.g. compound words)
      if (cleanedBadWord.length > 4 && normalized.includes(cleanedBadWord)) {
        return { isSafe: false, matchedWord: cleanedBadWord };
      }
    }

    return { isSafe: true };
  }

  async checkGeminiAI(
    texts: string[],
  ): Promise<{ isSafe: boolean; reason?: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    const mode = process.env.TEXT_MODERATION || 'enable';

    if (mode === 'disable') {
      this.logger.log(
        'Gemini text moderation bypassed (TEXT_MODERATION=disable).',
      );
      return { isSafe: true };
    }

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not defined in environment. Bypassing Gemini AI fallback.',
      );
      return { isSafe: true };
    }

    try {
      const filteredTexts = texts.map((t) => t.trim()).filter(Boolean);
      if (filteredTexts.length === 0) return { isSafe: true };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const response = await axios.post(
        url,
        {
          contents: [
            {
              parts: [
                {
                  text: `You are a text content moderation AI. Analyze the following list of text fields from an ad submission and determine if any of them contain inappropriate, offensive, hateful, sexual, violent, fraudulent, or policy-violating content. Respond ONLY with a JSON object in this format: { "isSafe": boolean, "reason": "brief explanation of why it is unsafe or null" }.\n\nText fields to analyze:\n${JSON.stringify(filteredTexts, null, 2)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        },
        { timeout: 5000 },
      );

      const responseText =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API');
      }

      const result = JSON.parse(responseText.trim());
      return {
        isSafe: result.isSafe !== false,
        reason: result.reason || undefined,
      };
    } catch (err) {
      this.logger.error(
        `Gemini AI moderation failed: ${err.message}. Defaulting to safe.`,
      );
      return { isSafe: true };
    }
  }

  extractAllStrings(obj: any): string[] {
    const strings: string[] = [];
    const walk = (item: any) => {
      if (!item) return;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return;
        if (/^[0-9a-fA-F]{24}$/.test(trimmed)) return; // ObjectId
        if (/^https?:\/\//i.test(trimmed)) return; // URL
        if (/^\+?[0-9]{7,15}$/.test(trimmed)) return; // Phone number
        if (
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            trimmed,
          )
        )
          return; // UUID
        strings.push(trimmed);
      } else if (Array.isArray(item)) {
        for (const val of item) {
          walk(val);
        }
      } else if (typeof item === 'object') {
        for (const key of Object.keys(item)) {
          if (
            [
              'userId',
              'userType',
              'category',
              'subCategory',
              'location',
              'city',
              'state',
              'pincode',
              'status',
              'paymentStatus',
              'id',
              '_id',
              'images',
              'videos',
            ].includes(key)
          ) {
            continue;
          }
          walk(item[key]);
        }
      }
    };
    walk(obj);
    return strings;
  }

  async moderatePayload(payload: any): Promise<{
    isSafe: boolean;
    failedContent?: string;
    matchedWord?: string;
    reason?: string;
  }> {
    const texts = this.extractAllStrings(payload);
    if (texts.length === 0) return { isSafe: true };

    // 1. Check local dictionary first (fastest)
    for (const text of texts) {
      const localCheck = this.checkLocalDictionary(text);
      if (!localCheck.isSafe) {
        this.logger.warn(
          `Local dictionary moderation rejected content: "${text}" (Matched: "${localCheck.matchedWord}")`,
        );
        return {
          isSafe: false,
          failedContent: text,
          matchedWord: localCheck.matchedWord,
        };
      }
    }

    // 2. Fallback to Gemini AI for nuanced checks in a single call
    const aiCheck = await this.checkGeminiAI(texts);
    if (!aiCheck.isSafe) {
      this.logger.warn(
        `Gemini AI moderation rejected payload. (Reason: "${aiCheck.reason}")`,
      );
      return {
        isSafe: false,
        reason: aiCheck.reason,
      };
    }

    return { isSafe: true };
  }
}
