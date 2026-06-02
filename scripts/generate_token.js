// Generate JWT token for test user
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

const userId = '69fae7223ce49a006cb548fa'; // User with prefs
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

const token = jwt.sign(
  { id: userId, email: 'NewUsser45@gmail.com', role: 'customer' },
  JWT_SECRET,
  { expiresIn: '15m' }
);

console.log(token);
