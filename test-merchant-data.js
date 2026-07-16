const mongoose = require('mongoose');
async function test() {
  await mongoose.connect('mongodb+srv://atharvapugade:12344321@cluster0.e740n.mongodb.net/test?retryWrites=true&w=majority');
  const User = mongoose.connection.collection('users');
  const user = await User.findOne({ _id: new mongoose.Types.ObjectId('6a58a3422ba4bc28ea6e8d88') });
  console.log("USER:", JSON.stringify(user, null, 2));
  
  const Merchant = mongoose.connection.collection('merchants');
  const merchant = await Merchant.findOne({ userId: '6a58a3422ba4bc28ea6e8d88' });
  console.log("MERCHANT PROFILE:", JSON.stringify(merchant, null, 2));
  
  process.exit(0);
}
test();
