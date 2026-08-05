const axios = require('axios');

async function testRegions() {
  try {
    const url = 'http://localhost:3002/regions/search?q=kolhapur&mode=ad';
    console.log(`Sending GET request to: ${url}`);
    const response = await axios.get(url);
    console.log('Response Status:', response.status);
    console.log('Response Data Sample:', JSON.stringify(response.data.slice(0, 3), null, 2));
  } catch (err) {
    console.error('Error message:', err.message);
    console.error('Stack:', err.stack);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
  }
}

testRegions();
