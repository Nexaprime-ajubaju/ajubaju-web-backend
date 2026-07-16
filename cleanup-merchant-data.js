const mongoose = require('mongoose');
async function test() {
  await mongoose.connect('mongodb+srv://atharvapugade:12344321@cluster0.e740n.mongodb.net/test?retryWrites=true&w=majority');
  
  const Merchant = mongoose.connection.collection('merchants');
  await Merchant.updateOne(
    { userId: '6a58a3422ba4bc28ea6e8d88' },
    { $unset: {
        storeSubCategory: "",
        businessType: "",
        yearsInBusiness: "",
        businessDescription: "",
        documents: ""
      }
    }
  );
  console.log("MOCK DATA REMOVED");
  
  process.exit(0);
}
test();
