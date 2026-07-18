const fetch = global.fetch || require('node-fetch');
(async()=>{
  const email = 'merchant-1783235284791@example.com';
  const password = 'Password123!';
  const loginRes = await fetch('http://localhost:3005/users/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, accountType: 'merchant' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data.accessToken;
  const payload = {
    name: 'Product 1',
    category: 'Food',
    stockQuantity: 5,
    price: 10,
    description: 'first',
    images: []
  };
  const r1 = await fetch('http://localhost:3005/merchant/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload)
  });
  console.log('create1 status', r1.status);
  console.log((await r1.text()).slice(0, 500));
  const r2 = await fetch('http://localhost:3005/merchant/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...payload, name: 'Product 2' })
  });
  console.log('create2 status', r2.status);
  console.log((await r2.text()).slice(0, 500));
})();
