const fs = require('fs');
const path = require('path');
const dir = 'c:/place/nexa/GOLO_backen_new/src/recommendation-engine/strategies';

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.strategy.ts')) {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    content = content.replace(/import \{ RecommendationStrategy \} from '\.\/recommendation\.strategy\.interface';/g, "import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';\nimport { RecommendationContext } from '../interfaces/recommendation.context';");
    content = content.replace(/async execute\(userId\?: string, context\?: any, limit: number = 10\): Promise<any\[\]> \{/g, "async getRecommendations(context: RecommendationContext): Promise<any[]> {\n    const limit = context.limit || 10;");
    fs.writeFileSync(path.join(dir, file), content);
  }
});
