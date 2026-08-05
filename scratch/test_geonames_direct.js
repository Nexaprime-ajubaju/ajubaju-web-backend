const axios = require('axios');

async function testGeoNames() {
  try {
    const url = 'http://api.geonames.org/searchJSON?name_startsWith=kolhapur&country=IN&maxRows=50&username=atharvapugade';
    console.log(`Sending GET request directly to GeoNames: ${url}`);
    const response = await axios.get(url);
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Error fetching from GeoNames:', err.message);
  }
}

testGeoNames();
