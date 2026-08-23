const http = require('http');

http.get('http://localhost:3002/search/unified?q=atharv', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Merchants:', parsed.data?.merchants?.length);
      console.log('Products:', parsed.data?.products?.length);
      console.log('Offers:', parsed.data?.offers?.length);
      if (parsed.data?.offers?.length > 0) {
         console.log('Sample Offer:', JSON.stringify(parsed.data.offers[0], null, 2));
      }
    } catch(e) {
      console.error(e, data);
    }
  });
}).on('error', console.error);
