const http = require('http');

http.get('http://localhost:3000/api/search/unified?q=atharv', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Merchants:', parsed.data?.merchants?.length);
      console.log('Products:', parsed.data?.products?.length);
      console.log('Offers:', parsed.data?.offers?.length);
    } catch(e) {
      console.error(e, data);
    }
  });
}).on('error', console.error);
