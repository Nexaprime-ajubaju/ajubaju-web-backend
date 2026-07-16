const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/users/admin/users/6a58a3422ba4bc28ea6e8d88/kyc',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify({ kycStatus: 'Verified' }));
req.end();
