async function run() {
  try {
    const res = await fetch('http://localhost:3005/banners/promotions/active?limit=10', {
      headers: {
        'Accept': 'application/json'
      }
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch(err) {
    console.error(err);
  }
}
run();
