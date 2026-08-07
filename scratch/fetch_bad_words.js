const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchWords() {
  try {
    const url = 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en';
    console.log(`Fetching bad words list from: ${url}`);
    
    const response = await axios.get(url);
    const text = response.data;
    
    // Split by newline and filter out empty lines or comments
    const words = text
      .split('\n')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0 && !w.startsWith('#'));
      
    console.log(`Successfully fetched ${words.length} bad words.`);
    
    const targetPath = path.join(__dirname, '..', 'src', 'moderation', 'data', 'bad-words.json');
    fs.writeFileSync(targetPath, JSON.stringify(words, null, 2));
    console.log(`Saved bad words list to: ${targetPath}`);
  } catch (err) {
    console.error('Failed to fetch bad words:', err.message);
  }
}

fetchWords();
