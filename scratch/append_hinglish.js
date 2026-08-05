const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'moderation', 'data', 'bad-words.json');

try {
  const rawData = fs.readFileSync(filePath, 'utf8');
  const words = JSON.parse(rawData);

  const hinglishWords = [
    "bhosdike",
    "bhosdi",
    "lavda",
    "loda",
    "lund",
    "chutiya",
    "chut",
    "gand",
    "gandu",
    "saala",
    "madarchod",
    "behenchod",
    "bhenchod",
    "randi",
    "harami",
    "laund",
    "kaminey",
    "bhadwa",
    "maderchod"
  ];

  let addedCount = 0;
  for (const word of hinglishWords) {
    if (!words.includes(word)) {
      words.push(word);
      addedCount++;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(words, null, 2));
  console.log(`Added ${addedCount} Hinglish/Hindi profanities. Total dictionary size: ${words.length}`);
} catch (err) {
  console.error('Failed to append Hinglish words:', err.message);
}
