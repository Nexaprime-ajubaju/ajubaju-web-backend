const fetch = global.fetch || require('node-fetch');
(async()=>{
  const email = 'merchant-' + Date.now() + '@example.com';
  const password = 'Password123!';
  const registerRes = await fetch('http://localhost:3005/users/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Plan Test Merchant',
      email,
      password,
      accountType: 'merchant',
      storeName: 'Plan Test Store',
      storeEmail: email,
      storeCategory: 'Food',
      storeLocation: 'Delhi',
      latitude: 28.6139,
      longitude: 77.2090,
      phone: '+919999999999'
    })
  });
  console.log('register status', registerRes.status);
  console.log((await registerRes.text()).slice(0, 800));
  const loginRes = await fetch('http://localhost:3005/users/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, accountType: 'merchant' })
  });
  console.log('login status', loginRes.status);
  console.log((await loginRes.text()).slice(0, 800));
})();
