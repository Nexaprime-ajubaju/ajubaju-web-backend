const jwt = require('jsonwebtoken');

async function test() {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_please_change_in_production';
  const payload = {
    sub: '6a49feb81808e29aad97ada4',
    email: 'admin@example.com',
    role: 'admin',
    adminType: 'ADMIN',
    name: 'Admin User'
  };
  
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  
  console.log("Calling DELETE http://localhost:3005/users/admin/users/6a49feb81808e29aad97ada4");
  
  const res = await fetch("http://localhost:3005/users/admin/users/6a49feb81808e29aad97ada4", {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}

test().catch(console.error);
