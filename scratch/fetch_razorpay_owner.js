const axios = require('axios');

async function getRazorpayOwner() {
  const keyId = 'rzp_test_TM56QU3toCzydG';
  const keySecret = 'DxvxVsR6dk75WRSi29MD1Scu';

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const url = 'https://api.razorpay.com/v1/merchant';
    
    console.log('Fetching merchant details from Razorpay...');
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    console.log('\n--- Razorpay Account Details ---');
    console.log('Merchant ID:', response.data.id);
    console.log('Business Name:', response.data.name);
    console.log('Account Owner Name:', response.data.owner_name || 'N/A');
    console.log('Email:', response.data.email || 'N/A');
    console.log('Status:', response.data.status || 'N/A');
  } catch (err) {
    console.error('Error fetching Razorpay details:', err.response ? err.response.data : err.message);
  }
}

getRazorpayOwner();
