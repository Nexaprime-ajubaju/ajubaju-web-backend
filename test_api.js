const http = require('http');

// 1. Get token
const req = http.request('http://localhost:3003/admin/auth/login', { 
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' } 
}, (res) => { 
  let data = ''; 
  res.on('data', c => data+=c); 
  res.on('end', () => { 
    try {
      const token = JSON.parse(data).data.accessToken; 
      
      // 2. Get categories
      http.get('http://localhost:3002/admin/categories', { 
        headers: { 'Authorization': 'Bearer ' + token } 
      }, (res2) => { 
        let data2 = ''; 
        res2.on('data', c => data2+=c); 
        res2.on('end', () => {
          const response = JSON.parse(data2);
          if(response.data && response.data.rows) {
            console.log(response.data.rows.map(r => ({ name: r.name, platform: r.platform })).slice(0, 5));
          } else {
            console.log(data2);
          }
        }) 
      }) 
    } catch (e) { console.error('Login failed', data); }
  });
}); 
req.write(JSON.stringify({ email: 'admin@golo.in', password: '123' + '456' })); 
req.end();
