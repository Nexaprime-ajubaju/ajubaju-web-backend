"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose = require("mongoose");
const uuid_1 = require("uuid");
const MONGODB_URI = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';
const PRODUCTS = {
    electronics: [
        { title: 'Samsung 55" 4K Smart TV', desc: 'Crystal UHD display with HDR10+ and built-in Alexa.', price: 42999, sub: 'Television' },
        { title: 'Sony WH-1000XM5 Headphones', desc: 'Industry-leading noise cancellation with 30hr battery.', price: 24990, sub: 'Audio' },
        { title: 'LG 8kg Front Load Washing Machine', desc: 'AI Direct Drive with Steam+ technology.', price: 34999, sub: 'Home Appliances' },
        { title: 'Dyson V12 Cordless Vacuum', desc: 'Laser detect technology reveals microscopic dust.', price: 46900, sub: 'Home Appliances' },
        { title: 'Apple iPad Air M2', desc: '11-inch Liquid Retina display with M2 chip.', price: 59900, sub: 'Tablets' },
        { title: 'Bose SoundLink Flex Speaker', desc: 'Waterproof portable Bluetooth speaker with deep bass.', price: 14900, sub: 'Audio' },
        { title: 'Philips Air Fryer HD9270', desc: '6.2L XL capacity with Rapid Air technology.', price: 8999, sub: 'Kitchen' },
        { title: 'Canon EOS R50 Mirrorless Camera', desc: '24.2MP APS-C sensor with 4K video recording.', price: 65990, sub: 'Camera' },
    ],
    mobiles: [
        { title: 'iPhone 16 Pro Max 256GB', desc: 'A18 Pro chip, titanium design, 48MP camera system.', price: 144900, sub: 'Smartphones' },
        { title: 'Samsung Galaxy S24 Ultra', desc: 'Galaxy AI with built-in S Pen and 200MP camera.', price: 129999, sub: 'Smartphones' },
        { title: 'OnePlus 12 Pro', desc: 'Snapdragon 8 Gen 3, Hasselblad camera, 100W SUPERVOOC.', price: 64999, sub: 'Smartphones' },
        { title: 'Google Pixel 8a', desc: 'Best of Google AI in a budget-friendly phone.', price: 39999, sub: 'Smartphones' },
        { title: 'Realme GT 6', desc: 'Snapdragon 7+ Gen 3 with 120Hz AMOLED display.', price: 25999, sub: 'Smartphones' },
        { title: 'Samsung Galaxy Watch 6', desc: 'Advanced health monitoring with BioActive sensor.', price: 22999, sub: 'Wearables' },
        { title: 'Apple AirPods Pro 2', desc: 'Adaptive Audio with USB-C charging case.', price: 24900, sub: 'Accessories' },
        { title: 'Nothing Phone 2a', desc: 'Unique Glyph interface with dual 50MP cameras.', price: 23999, sub: 'Smartphones' },
    ],
    furniture: [
        { title: 'Urban Ladder L-Shape Sofa', desc: 'Premium fabric 6-seater with chaise lounge.', price: 45999, sub: 'Sofa' },
        { title: 'IKEA MALM Queen Bed Frame', desc: 'Clean design with 4 storage drawers underneath.', price: 22999, sub: 'Bedroom' },
        { title: 'Godrej Interio Study Table', desc: 'Ergonomic computer desk with cable management.', price: 8999, sub: 'Tables' },
        { title: 'Wakefit Orthopaedic Mattress', desc: 'Memory foam king-size mattress, 7-zone support.', price: 14999, sub: 'Bedroom' },
        { title: 'HomeTown Dining Table Set (6-Seater)', desc: 'Solid sheesham wood with cushioned chairs.', price: 35999, sub: 'Dining' },
        { title: 'Nilkamal Freedom Cabinet', desc: 'Large 4-door plastic wardrobe, weather resistant.', price: 6499, sub: 'Storage' },
    ],
    vehicle: [
        { title: 'Hero Splendor Plus BS6', desc: '2024 model, 1200km driven, single owner, excellent mileage.', price: 72000, sub: 'Motorcycle' },
        { title: 'Maruti Suzuki Swift VXi 2023', desc: 'Petrol, 8000km driven, single owner, fully insured.', price: 699000, sub: 'Car' },
        { title: 'Royal Enfield Classic 350', desc: 'Dark Stealth Black, 5000km, all papers clear.', price: 175000, sub: 'Motorcycle' },
        { title: 'Honda Activa 6G', desc: 'White color, 2024 model, only 800km driven.', price: 85000, sub: 'Scooter' },
    ],
    property: [
        { title: '2BHK Flat in Noida Sector 62', desc: 'Semi-furnished, 950 sqft, 5th floor, park facing.', price: 4500000, sub: 'Apartment' },
        { title: '3BHK Villa in Gurugram', desc: 'Gated community, 2100 sqft, modular kitchen, garden.', price: 12500000, sub: 'Villa' },
        { title: 'Commercial Shop Lajpat Nagar', desc: 'Ground floor, 400 sqft, main market facing.', price: 8500000, sub: 'Commercial' },
    ],
    service: [
        { title: 'AC Repair & Installation Service', desc: 'All brands, same-day service, 90-day warranty.', price: 499, sub: 'Home Services' },
        { title: 'Professional House Cleaning', desc: 'Deep cleaning for 2BHK/3BHK. Trained staff.', price: 1999, sub: 'Cleaning' },
        { title: 'Pest Control - Full Home', desc: 'Herbal treatment, 3-month warranty, safe for kids.', price: 1499, sub: 'Pest Control' },
        { title: 'Packers & Movers Delhi NCR', desc: 'Door-to-door shifting with insurance coverage.', price: 5999, sub: 'Moving' },
    ],
    pets: [
        { title: 'Golden Retriever Puppy', desc: '3-month-old male, vaccinated, KCI registered.', price: 25000, sub: 'Dogs' },
        { title: 'Persian Cat Kitten', desc: 'White doll-face, 2 months old, litter trained.', price: 12000, sub: 'Cats' },
    ],
    education: [
        { title: 'IIT-JEE Coaching Batch 2026', desc: 'Offline classes in Kota, experienced faculty, study material included.', price: 150000, sub: 'Coaching' },
        { title: 'IELTS Preparation Course', desc: 'Online + offline, guaranteed 7+ band, mock tests included.', price: 15000, sub: 'Language' },
    ],
    travel: [
        { title: 'Manali 4N/5D Package', desc: 'Hotel + transport + sightseeing. Couple-friendly.', price: 12999, sub: 'Tour Package' },
        { title: 'Goa Beach Resort 3N', desc: 'Beachfront resort, breakfast included, airport pickup.', price: 8999, sub: 'Resort' },
    ],
};
const FLASH_DEALS = [
    { title: 'boAt Rockerz 450 Headphone', cat: 'Electronics & Home appliances', sub: 'Audio', orig: 2499, sale: 999, disc: 60 },
    { title: 'Fire-Boltt Phoenix Smart Watch', cat: 'Mobiles', sub: 'Wearables', orig: 6999, sale: 1999, disc: 71 },
    { title: 'Noise ColorFit Pro 5 Watch', cat: 'Electronics & Home appliances', sub: 'Wearables', orig: 5999, sale: 2499, disc: 58 },
    { title: 'Prestige Induction Cooktop', cat: 'Electronics & Home appliances', sub: 'Kitchen', orig: 3499, sale: 1599, disc: 54 },
    { title: 'Puma Men Running Shoes', cat: 'Other', sub: 'Footwear', orig: 4999, sale: 1799, disc: 64 },
    { title: 'Wildcraft 45L Trekking Backpack', cat: 'Travel', sub: 'Bags', orig: 3999, sale: 1299, disc: 67 },
    { title: 'JBL Go 3 Portable Speaker', cat: 'Electronics & Home appliances', sub: 'Audio', orig: 3999, sale: 1999, disc: 50 },
    { title: 'Pigeon Stovekraft Cookware Set', cat: 'Electronics & Home appliances', sub: 'Kitchen', orig: 2999, sale: 999, disc: 67 },
    { title: 'Fastrack Reflex Vox Smartband', cat: 'Mobiles', sub: 'Wearables', orig: 3495, sale: 1495, disc: 57 },
    { title: 'Mi Power Bank 20000mAh', cat: 'Mobiles', sub: 'Accessories', orig: 2499, sale: 1199, disc: 52 },
];
const NEW_ARRIVALS = [
    { title: 'Nothing Ear (3) Open', cat: 'Mobiles', sub: 'Accessories', price: 5999 },
    { title: 'Samsung Galaxy Ring', cat: 'Mobiles', sub: 'Wearables', price: 34999 },
    { title: 'Dyson Supersonic Nural Dryer', cat: 'Electronics & Home appliances', sub: 'Personal Care', price: 34900 },
    { title: 'IKEA KALLAX Shelf Unit (New Color)', cat: 'Furniture', sub: 'Storage', price: 5999 },
    { title: 'OnePlus Nord Buds 3 Pro', cat: 'Mobiles', sub: 'Accessories', price: 3299 },
    { title: 'Godrej Aer Smart Matic Diffuser', cat: 'Electronics & Home appliances', sub: 'Home', price: 799 },
    { title: 'Sony INZONE H5 Gaming Headset', cat: 'Electronics & Home appliances', sub: 'Gaming', price: 14990 },
    { title: 'Apple Vision Pro', cat: 'Electronics & Home appliances', sub: 'AR/VR', price: 359900 },
    { title: 'Bajaj Pulsar NS200 2026 Edition', cat: 'Vehicle', sub: 'Motorcycle', price: 145000 },
    { title: 'realme Pad 2 Mini', cat: 'Electronics & Home appliances', sub: 'Tablets', price: 13999 },
];
const REPEAT_PURCHASE = [
    { title: 'Tata Sampann Chana Dal 1kg', cat: 'Other', sub: 'Grocery', price: 159 },
    { title: 'Amul Gold Full Cream Milk 1L', cat: 'Other', sub: 'Dairy', price: 68 },
    { title: 'Dettol Antiseptic Liquid 500ml', cat: 'Other', sub: 'Medicine', price: 199 },
    { title: 'Surf Excel Matic Liquid 2L', cat: 'Other', sub: 'Household', price: 449 },
    { title: 'Himalaya Baby Lotion 400ml', cat: 'Other', sub: 'Baby Care', price: 245 },
    { title: 'Whiskas Cat Food Tuna 3kg', cat: 'Pets', sub: 'Pet Food', price: 1199 },
    { title: 'Aashirvaad Whole Wheat Atta 5kg', cat: 'Other', sub: 'Grocery', price: 289 },
    { title: 'Harpic Disinfectant Toilet Cleaner 1L', cat: 'Other', sub: 'Household', price: 159 },
    { title: 'Parachute Coconut Oil 600ml', cat: 'Other', sub: 'Cosmetics', price: 199 },
    { title: 'Bisleri 20L Water Can', cat: 'Other', sub: 'Water', price: 80 },
];
const BEST_SELLERS = [
    { title: 'Nike Air Max 270 Sneakers', cat: 'Other', sub: 'Footwear', price: 11995 },
    { title: 'Boat Airdopes 141 TWS Earbuds', cat: 'Electronics & Home appliances', sub: 'Audio', price: 1299 },
    { title: 'Levi\'s 511 Slim Fit Jeans', cat: 'Other', sub: 'Fashion', price: 2999 },
    { title: 'Prestige Popular Pressure Cooker 5L', cat: 'Electronics & Home appliances', sub: 'Kitchen', price: 1599 },
    { title: 'Samsung 256GB EVO Plus MicroSD', cat: 'Mobiles', sub: 'Accessories', price: 1999 },
    { title: 'Crompton Energion HS 1200mm Ceiling Fan', cat: 'Electronics & Home appliances', sub: 'Home', price: 3499 },
    { title: 'Cello Checkers Plastic Chairs (Set of 4)', cat: 'Furniture', sub: 'Chairs', price: 3999 },
    { title: 'Bajaj Majesty RX11 Room Heater', cat: 'Electronics & Home appliances', sub: 'Home', price: 2299 },
    { title: 'Himalaya Neem Face Wash 200ml', cat: 'Other', sub: 'Cosmetics', price: 199 },
    { title: 'Milton Thermosteel Flask 1L', cat: 'Other', sub: 'Kitchen', price: 899 },
];
const TRENDING = [
    { title: 'Ray-Ban Aviator Sunglasses', cat: 'Other', sub: 'Accessories', price: 7990 },
    { title: 'Zebronics Zeb-Transformer Pro Gaming Keyboard', cat: 'Electronics & Home appliances', sub: 'Gaming', price: 1499 },
    { title: 'Portronics Harmonics Twins S8 Earbuds', cat: 'Electronics & Home appliances', sub: 'Audio', price: 999 },
    { title: 'WOW Skin Science Apple Cider Vinegar Shampoo', cat: 'Other', sub: 'Cosmetics', price: 449 },
    { title: 'Decathlon Quechua 2-Person Tent', cat: 'Travel', sub: 'Camping', price: 4999 },
    { title: 'HP 15 Laptop Ryzen 5 / 16GB / 512GB', cat: 'Electronics & Home appliances', sub: 'Laptops', price: 45990 },
    { title: 'Bewakoof Oversized T-Shirt Pack of 3', cat: 'Other', sub: 'Fashion', price: 1299 },
    { title: 'Syska LED Bulb 9W (Pack of 6)', cat: 'Electronics & Home appliances', sub: 'Home', price: 599 },
    { title: 'Logitech MX Master 3S Mouse', cat: 'Electronics & Home appliances', sub: 'Peripherals', price: 8995 },
    { title: 'MCaffeine Coffee Body Scrub 200g', cat: 'Other', sub: 'Cosmetics', price: 449 },
];
const categoryMap = {
    electronics: 'Electronics & Home appliances',
    mobiles: 'Mobiles',
    furniture: 'Furniture',
    vehicle: 'Vehicle',
    property: 'Property',
    service: 'Service',
    pets: 'Pets',
    education: 'Education',
    travel: 'Travel',
};
const LOCATIONS = [
    { lat: 28.6139, lng: 77.2090, city: 'New Delhi', area: 'Connaught Place' },
    { lat: 28.5355, lng: 77.3910, city: 'Noida', area: 'Sector 62' },
    { lat: 28.4595, lng: 77.0266, city: 'Gurugram', area: 'Cyber Hub' },
    { lat: 28.6692, lng: 77.4538, city: 'Ghaziabad', area: 'Indirapuram' },
    { lat: 28.7041, lng: 77.1025, city: 'Delhi', area: 'Pitampura' },
];
async function seed() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');
    const db = mongoose.connection.db;
    if (!db)
        throw new Error('Database not found');
    const usersCollection = db.collection('users');
    const merchantsCollection = db.collection('merchants');
    const adsCollection = db.collection('ads');
    const bestSellersCollection = db.collection('best_sellers');
    const trendingCollection = db.collection('trending_products');
    console.log('Cleaning up old tester data...');
    const oldTester = await usersCollection.findOne({ email: 'tester_golo@example.com' });
    if (oldTester) {
        const oldTesterId = oldTester._id.toString();
        await merchantsCollection.deleteMany({ userId: oldTesterId });
        await adsCollection.deleteMany({ userId: oldTesterId });
        await usersCollection.deleteOne({ _id: oldTester._id });
    }
    await bestSellersCollection.deleteMany({});
    await trendingCollection.deleteMany({});
    const testerId = new mongoose.Types.ObjectId();
    await usersCollection.insertOne({
        _id: testerId,
        name: 'tester',
        email: 'tester_golo@example.com',
        password: 'password123',
        role: 'merchant',
        accountType: 'merchant',
        isEmailVerified: true,
        loyaltyPoints: 0,
        merchantLoyaltyPoints: {},
        passwordHistory: [],
        refreshTokens: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    console.log(`✅ Created tester user: ${testerId}`);
    const merchantId = new mongoose.Types.ObjectId();
    await merchantsCollection.insertOne({
        _id: merchantId,
        userId: testerId.toString(),
        businessName: 'Tester Super Store',
        businessType: 'Retail',
        contactPerson: 'Tester Man',
        email: 'tester_golo@example.com',
        phone: '9876543210',
        address: '123 Tester Avenue, Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        location: { type: 'Point', coordinates: [77.2090, 28.6139] },
        isActive: true,
        rating: 4.8,
        totalReviews: 120,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    console.log(`✅ Created tester merchant: ${merchantId}`);
    function makeAd(opts) {
        const loc = LOCATIONS[opts.locIdx ?? Math.floor(Math.random() * LOCATIONS.length)];
        return {
            _id: new mongoose.Types.ObjectId(),
            adId: (0, uuid_1.v4)(),
            title: opts.title,
            description: opts.desc,
            category: opts.category,
            subCategory: opts.sub,
            userId: testerId.toString(),
            userType: 'Customer',
            images: ['https://via.placeholder.com/300'],
            videos: [],
            price: opts.price,
            originalPrice: opts.origPrice ?? opts.price,
            discountPercent: opts.disc ?? 0,
            negotiable: opts.price > 5000,
            editCount: 0,
            hasUsedEdit: false,
            location: loc.city,
            city: loc.city,
            state: 'Delhi',
            pincode: '110001',
            latitude: loc.lat,
            longitude: loc.lng,
            locationCoordinates: { type: 'Point', coordinates: [loc.lng, loc.lat] },
            contactInfo: { name: 'Tester Man', phone: '9876543210', preferredContactMethod: 'phone' },
            status: 'active',
            views: Math.floor(Math.random() * 500),
            contactClicks: Math.floor(Math.random() * 50),
            viewHistory: [],
            tags: opts.tags ?? ['tester'],
            isPromoted: opts.isPromoted ?? false,
            reportCount: 0,
            isUnderReview: false,
            autoDisabled: false,
            createdAt: opts.createdAt ?? new Date(),
            updatedAt: new Date(),
        };
    }
    const allAds = [];
    console.log('Creating regular products...');
    for (const [catKey, items] of Object.entries(PRODUCTS)) {
        const cat = categoryMap[catKey];
        for (const item of items) {
            allAds.push(makeAd({
                title: item.title, desc: item.desc, category: cat, sub: item.sub,
                price: item.price, tags: ['tester', catKey, item.sub.toLowerCase()],
            }));
        }
    }
    console.log(`   📦 ${allAds.length} regular products`);
    const flashStart = allAds.length;
    for (const fd of FLASH_DEALS) {
        allAds.push(makeAd({
            title: fd.title, desc: `🔥 Flash Deal! Save ${fd.disc}% today only.`,
            category: fd.cat, sub: fd.sub,
            price: fd.sale, origPrice: fd.orig, disc: fd.disc,
            tags: ['tester', 'flash', 'deal'], isPromoted: Math.random() > 0.5,
        }));
    }
    console.log(`   ⚡ ${FLASH_DEALS.length} flash deals`);
    const now = new Date();
    for (const na of NEW_ARRIVALS) {
        allAds.push(makeAd({
            title: na.title, desc: `✨ Just launched! ${na.title} now available.`,
            category: na.cat, sub: na.sub, price: na.price,
            tags: ['tester', 'new', 'arrival'], createdAt: now,
        }));
    }
    console.log(`   🆕 ${NEW_ARRIVALS.length} new arrivals`);
    for (const rp of REPEAT_PURCHASE) {
        allAds.push(makeAd({
            title: rp.title, desc: `Daily essential: ${rp.title}`,
            category: rp.cat, sub: rp.sub, price: rp.price,
            tags: ['tester', 'grocery', 'daily', rp.sub.toLowerCase()],
        }));
    }
    console.log(`   🔄 ${REPEAT_PURCHASE.length} repeat purchase items`);
    const bestSellerAds = [];
    for (const bs of BEST_SELLERS) {
        const ad = makeAd({
            title: bs.title, desc: `⭐ Best Seller: ${bs.title}`,
            category: bs.cat, sub: bs.sub, price: bs.price,
            tags: ['tester', 'bestseller', bs.sub.toLowerCase()],
        });
        allAds.push(ad);
        bestSellerAds.push(ad);
    }
    console.log(`   🏆 ${BEST_SELLERS.length} best sellers`);
    const trendingAds = [];
    for (const tr of TRENDING) {
        const ad = makeAd({
            title: tr.title, desc: `📈 Trending: ${tr.title}`,
            category: tr.cat, sub: tr.sub, price: tr.price,
            tags: ['tester', 'trending', tr.sub.toLowerCase()],
        });
        allAds.push(ad);
        trendingAds.push(ad);
    }
    console.log(`   📈 ${TRENDING.length} trending products`);
    await adsCollection.insertMany(allAds);
    console.log(`\n✅ Inserted ${allAds.length} total ads into the database.`);
    const bestSellerRecords = bestSellerAds.map((ad, i) => ({
        productId: ad._id.toString(),
        score: 10000 - i * 100,
        rank: i + 1,
        updatedAt: new Date(),
    }));
    await bestSellersCollection.insertMany(bestSellerRecords);
    console.log(`✅ Injected ${bestSellerRecords.length} records into best_sellers collection.`);
    const trendingRecords = trendingAds.map((ad, i) => ({
        productId: ad._id.toString(),
        velocityScore: 5000 - i * 100,
        rank: i + 1,
        updatedAt: new Date(),
    }));
    await trendingCollection.insertMany(trendingRecords);
    console.log(`✅ Injected ${trendingRecords.length} records into trending_products collection.`);
    console.log('\n' + '═'.repeat(50));
    console.log('  SEED SUMMARY');
    console.log('═'.repeat(50));
    console.log(`  Merchant:  tester_golo@example.com / password123`);
    console.log(`  User ID:   ${testerId}`);
    console.log(`  Total Ads: ${allAds.length}`);
    console.log('  ──────────────────────────────────');
    console.log(`  Regular Products:  ${allAds.length - FLASH_DEALS.length - NEW_ARRIVALS.length - REPEAT_PURCHASE.length - BEST_SELLERS.length - TRENDING.length}`);
    console.log(`  Flash Deals:       ${FLASH_DEALS.length}`);
    console.log(`  New Arrivals:      ${NEW_ARRIVALS.length}`);
    console.log(`  Repeat Purchase:   ${REPEAT_PURCHASE.length}`);
    console.log(`  Best Sellers:      ${BEST_SELLERS.length}`);
    console.log(`  Trending:          ${TRENDING.length}`);
    console.log('═'.repeat(50));
    await mongoose.disconnect();
}
seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-tester.js.map