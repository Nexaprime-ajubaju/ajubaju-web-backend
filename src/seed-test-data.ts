import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { BannerPromotion, BannerPromotionType } from './banners/schemas/banner-promotion.schema';
import { OfferPromotion, OfferPromotionStatus, OfferPaymentStatus } from './offers/schemas/offer-promotion.schema';
import { Merchant } from './users/schemas/merchant.schema';
import { User, UserRole } from './users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

async function seedTestData() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const bannerModel = app.get(getModelToken(BannerPromotion.name)) as Model<BannerPromotion>;
  const offerModel = app.get(getModelToken(OfferPromotion.name)) as Model<OfferPromotion>;
  const merchantModel = app.get(getModelToken(Merchant.name)) as Model<Merchant>;
  const userModel = app.get(getModelToken(User.name)) as Model<any>;
  
  // Clear existing test data
  await bannerModel.deleteMany({});
  await merchantModel.deleteMany({});
  await userModel.deleteMany({ email: { $in: ['pizza@example.com', 'fashion@example.com', 'tech@example.com', 'cafe@example.com', 'salon@example.com', 'testuser@example.com'] } });
  
  // Create test users (merchants and regular user)
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const testUsers = [
    {
      email: 'pizza@example.com',
      password: hashedPassword,
      name: 'Pizza Palace Owner',
      role: UserRole.MERCHANT,
      accountType: 'merchant',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
    {
      email: 'fashion@example.com',
      password: hashedPassword,
      name: 'Fashion Hub Owner',
      role: UserRole.MERCHANT,
      accountType: 'merchant',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
    {
      email: 'tech@example.com',
      password: hashedPassword,
      name: 'Tech World Owner',
      role: UserRole.MERCHANT,
      accountType: 'merchant',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
    {
      email: 'cafe@example.com',
      password: hashedPassword,
      name: 'Cafe Delight Owner',
      role: UserRole.MERCHANT,
      accountType: 'merchant',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
    {
      email: 'salon@example.com',
      password: hashedPassword,
      name: 'Salon Elegance Owner',
      role: UserRole.MERCHANT,
      accountType: 'merchant',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
    {
      email: 'testuser@example.com',
      password: hashedPassword,
      name: 'Test User',
      role: UserRole.USER,
      accountType: 'user',
      isEmailVerified: true,
      refreshTokens: [],
      metadata: {},
    },
  ];

  const createdUsers = await userModel.insertMany(testUsers);
  console.log(`✅ Created ${testUsers.length} test users`);
  
  // Create test merchants with store locations
  const testMerchants = [
    {
      userId: createdUsers[0]._id.toString(),
      storeName: 'Pizza Palace',
      storeEmail: 'pizza@example.com',
      storeCategory: 'Food & Dining',
      storeSubCategory: 'Pizzas',
      storeLocation: 'Shop 12, Ground Floor, Oberoi Mall, Goregaon West, Mumbai',
      storeLocationLatitude: 19.1646,
      storeLocationLongitude: 72.8494,
      profilePhoto: '',
    },
    {
      userId: createdUsers[1]._id.toString(),
      storeName: 'Fashion Hub',
      storeEmail: 'fashion@example.com',
      storeCategory: 'Fashion',
      storeSubCategory: 'Clothing',
      storeLocation: 'Unit 5, Linking Road, Bandra West, Mumbai',
      storeLocationLatitude: 19.0505,
      storeLocationLongitude: 72.8316,
      profilePhoto: '',
    },
    {
      userId: createdUsers[2]._id.toString(),
      storeName: 'Tech World',
      storeEmail: 'tech@example.com',
      storeCategory: 'Electronics',
      storeSubCategory: 'Accessories',
      storeLocation: 'Shop 101, Phoenix Market City, Kurla East, Mumbai',
      storeLocationLatitude: 19.0863,
      storeLocationLongitude: 72.8874,
      profilePhoto: '',
    },
    {
      userId: createdUsers[3]._id.toString(),
      storeName: 'Cafe Delight',
      storeEmail: 'cafe@example.com',
      storeCategory: 'Food & Dining',
      storeSubCategory: 'Cafes',
      storeLocation: 'Ground Floor, KStar Building, Vashi, Navi Mumbai',
      storeLocationLatitude: 19.0663,
      storeLocationLongitude: 72.9974,
      profilePhoto: '',
    },
    {
      userId: createdUsers[4]._id.toString(),
      storeName: 'Salon Elegance',
      storeEmail: 'salon@example.com',
      storeCategory: 'Beauty',
      storeSubCategory: 'Salons',
      storeLocation: 'Shop 3, Andheri Station Road, Andheri West, Mumbai',
      storeLocationLatitude: 19.1137,
      storeLocationLongitude: 72.8697,
      profilePhoto: '',
    },
  ];

  await merchantModel.insertMany(testMerchants);
  console.log(`�� Created ${testMerchants.length} merchants`);
  
  // Create test offers
  const testOffers = [
    {
      requestId: uuidv4(),
      merchantId: createdUsers[0]._id.toString(),
      merchantName: 'Pizza Palace',
      merchantEmail: 'pizza@example.com',
      title: '50% OFF on All Pizzas',
      category: 'Special',
      description: 'Get 50% discount on all pizza orders this weekend!',
      
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
      selectedDates: [
        new Date('2026-04-22'),
        new Date('2026-04-23'),
        new Date('2026-04-24'),
        new Date('2026-04-25'),
        new Date('2026-04-26'),
      ],
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-30'),
      selectedDays: 5,
      dailyRate: 100,
      platformFee: 49,
      totalPrice: 299,
      loyaltyRewardEnabled: true,
      loyaltyStarsToOffer: 5,
      loyaltyStarsPerPurchase: 1,
      loyaltyScorePerStar: 50,
      promotionExpiryText: 'Offer ends in 30 days',
      termsAndConditions: 'Valid only on dine-in and delivery orders.',
      exampleUsage: 'Order a large pizza for Rs 500 and earn 1 star.',
      selectedProducts: [
        {
          productId: 'prod-1',
          productName: 'Margherita Pizza',
          imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=400',
          originalPrice: 599,
          offerPrice: 299,
          stockQuantity: 50,
        },
        {
          productId: 'prod-2',
          productName: 'Pepperoni Pizza',
          imageUrl: 'https://images.unsplash.com/photo-1628840042765-521c1f5a8a30?w=400',
          originalPrice: 699,
          offerPrice: 349,
          stockQuantity: 30,
        },
      ],
      status: OfferPromotionStatus.ACTIVE,
      paymentStatus: OfferPaymentStatus.PAID,
      isHomepageVisible: true,
      paidAt: new Date(),
    },
    {
      requestId: uuidv4(),
      merchantId: createdUsers[1]._id.toString(),
      merchantName: 'Fashion Hub',
      merchantEmail: 'fashion@example.com',
      title: 'Flat 30% OFF on Clothing',
      category: 'Festival',
      description: 'Massive sale on all clothing items!',
      
      imageUrl: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800',
      selectedDates: [
        new Date('2026-04-22'),
        new Date('2026-04-23'),
        new Date('2026-04-24'),
      ],
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-28'),
      selectedDays: 3,
      dailyRate: 150,
      platformFee: 49,
      totalPrice: 559,
      loyaltyRewardEnabled: true,
      loyaltyStarsToOffer: 3,
      loyaltyStarsPerPurchase: 1,
      loyaltyScorePerStar: 100,
      promotionExpiryText: 'Limited time offer',
      termsAndConditions: 'Valid on all regular-priced items.',
      exampleUsage: 'Shop for Rs 1000 and earn 1 star.',
      selectedProducts: [
        {
          productId: 'prod-3',
          productName: "Men's T-Shirt",
          imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
          originalPrice: 799,
          offerPrice: 559,
          stockQuantity: 100,
        },
        {
          productId: 'prod-4',
          productName: "Women's Kurti",
          imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400',
          originalPrice: 999,
          offerPrice: 699,
          stockQuantity: 75,
        },
      ],
      status: OfferPromotionStatus.ACTIVE,
      paymentStatus: OfferPaymentStatus.PAID,
      isHomepageVisible: true,
      paidAt: new Date(),
    },
    {
      requestId: uuidv4(),
      merchantId: createdUsers[2]._id.toString(),
      merchantName: 'Tech World',
      merchantEmail: 'tech@example.com',
      title: 'Buy 1 Get 1 Free on Accessories',
      category: 'BOGO',
      description: 'Amazing BOGO deals on phone cases and accessories!',
      
      imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      selectedDates: [
        new Date('2026-04-22'),
        new Date('2026-04-23'),
      ],
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-26'),
      selectedDays: 2,
      dailyRate: 200,
      platformFee: 49,
      totalPrice: 149,
      loyaltyRewardEnabled: false,
      loyaltyStarsToOffer: 0,
      loyaltyStarsPerPurchase: 1,
      loyaltyScorePerStar: 10,
      promotionExpiryText: '',
      termsAndConditions: 'Buy any phone case, get another free.',
      exampleUsage: '',
      selectedProducts: [
        {
          productId: 'prod-5',
          productName: 'iPhone Case',
          imageUrl: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=400',
          originalPrice: 299,
          offerPrice: 149,
          stockQuantity: 200,
        },
      ],
      status: OfferPromotionStatus.ACTIVE,
      paymentStatus: OfferPaymentStatus.PAID,
      isHomepageVisible: true,
      paidAt: new Date(),
    },
    {
      requestId: uuidv4(),
      merchantId: createdUsers[3]._id.toString(),
      merchantName: 'Cafe Delight',
      merchantEmail: 'cafe@example.com',
      title: '20% Cashback on All Orders',
      category: 'Cashback',
      description: 'Get 20% cashback on every order above Rs 200!',
      
      imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
      selectedDates: [
        new Date('2026-04-22'),
        new Date('2026-04-23'),
        new Date('2026-04-24'),
        new Date('2026-04-25'),
      ],
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-29'),
      selectedDays: 4,
      dailyRate: 120,
      platformFee: 49,
      totalPrice: 119,
      loyaltyRewardEnabled: true,
      loyaltyStarsToOffer: 4,
      loyaltyStarsPerPurchase: 1,
      loyaltyScorePerStar: 25,
      promotionExpiryText: 'Weekend special',
      termsAndConditions: 'Cashback credited as loyalty stars.',
      exampleUsage: 'Order for Rs 500 and earn 4 stars.',
      selectedProducts: [
        {
          productId: 'prod-6',
          productName: 'Cold Coffee',
          imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400',
          originalPrice: 149,
          offerPrice: 119,
          stockQuantity: 500,
        },
        {
          productId: 'prod-7',
          productName: 'Muffin Combo',
          imageUrl: 'https://images.unsplash.com/photo-1604457843812-2c5c79a3b98a?w=400',
          originalPrice: 199,
          offerPrice: 149,
          stockQuantity: 300,
        },
      ],
      status: OfferPromotionStatus.ACTIVE,
      paymentStatus: OfferPaymentStatus.PAID,
      isHomepageVisible: true,
      paidAt: new Date(),
    },
    {
      requestId: uuidv4(),
      merchantId: createdUsers[4]._id.toString(),
      merchantName: 'Salon Elegance',
      merchantEmail: 'salon@example.com',
      title: 'Hair Spa Combo - Rs 499 only',
      category: 'Combo',
      description: 'Get hair wash, spa, and styling for just Rs 499!',
      
      imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
      selectedDates: [
        new Date('2026-04-22'),
        new Date('2026-04-23'),
        new Date('2026-04-24'),
        new Date('2026-04-25'),
        new Date('2026-04-26'),
        new Date('2026-04-27'),
        new Date('2026-04-28'),
      ],
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-05-05'),
      selectedDays: 7,
      dailyRate: 80,
      platformFee: 49,
      totalPrice: 499,
      loyaltyRewardEnabled: true,
      loyaltyStarsToOffer: 6,
      loyaltyStarsPerPurchase: 1,
      loyaltyScorePerStar: 40,
      promotionExpiryText: 'Monthly special',
      termsAndConditions: 'Includes wash, oil massage, and styling.',
      exampleUsage: 'Book combo and earn 6 stars.',
      selectedProducts: [
        {
          productId: 'prod-8',
          productName: 'Basic Hair Spa',
          imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400',
          originalPrice: 899,
          offerPrice: 499,
          stockQuantity: 50,
        },
      ],
      status: OfferPromotionStatus.ACTIVE,
      paymentStatus: OfferPaymentStatus.PAID,
      isHomepageVisible: true,
      paidAt: new Date(),
    },
  ];

  await offerModel.deleteMany({});
  await offerModel.insertMany(testOffers);
  
  console.log('✅ Test data seeded successfully!');
  console.log(`   Created ${testMerchants.length} merchants with locations`);
  console.log(`   Created ${testOffers.length} offers`);
  
  await app.close();
  process.exit(0);
}

seedTestData().catch((error) => {
  console.error('❌ Failed to seed test data:', error);
  process.exit(1);
});