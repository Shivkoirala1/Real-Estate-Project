// Seeds the database with an initial admin account, sample property types,
// districts and cities so the app is usable immediately after setup.
// Run with: npm run seed

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Property = require('../models/Property');
const { PropertyType, District, City } = require('../models/Category');
const { PROVINCES, DISTRICTS } = require('./nepalGeoData');

const run = async () => {
  await connectDB();

  // --- Admin user ---
  const adminEmail = 'admin@realestate.com';
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      name: 'System Administrator',
      email: adminEmail,
      password: 'Admin@123',
      role: 'admin',
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      isEmailVerified: true,
    });
    console.log(`Admin created -> email: ${adminEmail} / password: Admin@123`);
  } else {
    console.log('Admin user already exists, skipping.');
  }

  // --- Sample verified user (demonstrates a user who can post properties) ---
  const sampleEmail = 'user@realestate.com';
  const existingSample = await User.findOne({ email: sampleEmail });
  if (!existingSample) {
    await User.create({
      name: 'Sample Verified User',
      email: sampleEmail,
      password: 'User@123',
      role: 'user',
      selfiePhoto: '/uploads/placeholder-selfie.jpg',
      citizenshipPhotoFront: '/uploads/placeholder-citizenship-front.jpg',
      citizenshipPhotoBack: '/uploads/placeholder-citizenship-back.jpg',
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      isEmailVerified: true,
    });
    console.log(`Verified sample user created -> email: ${sampleEmail} / password: User@123`);
  }

  // --- Property Types --- "Land" is the only one that gets the practical
  // land-specific posting form; everything else is a building.
  const propertyTypes = [
    { name: 'House', category: 'building' },
    { name: 'Apartment', category: 'building' },
    { name: 'Land', category: 'land' },
    { name: 'Commercial Space', category: 'building' },
    { name: 'Villa', category: 'building' },
    { name: 'Traditional Nepali Home', category: 'building' },
  ];
  for (const { name, category } of propertyTypes) {
    await PropertyType.updateOne({ name }, { name, category }, { upsert: true });
  }
  console.log('Property types seeded.');

  // --- Districts & Cities: the complete, official set of Nepal's 7
  // provinces and 77 districts (backend/utils/nepalGeoData.js), not just a
  // handful of sample entries. This is what lets the Add Property form
  // offer a real province -> district -> city picker instead of free text,
  // so no made-up locations can be saved.
  for (const [districtName, { province, cities }] of Object.entries(DISTRICTS)) {
    const district = await District.findOneAndUpdate(
      { name: districtName },
      { name: districtName, province },
      { upsert: true, new: true }
    );
    for (const cityName of cities) {
      await City.updateOne(
        { name: cityName, district: district._id },
        { name: cityName, district: district._id },
        { upsert: true }
      );
    }
  }
  console.log(`Districts and cities seeded (${Object.keys(DISTRICTS).length} districts across ${PROVINCES.length} provinces).`);

  // --- Sample Properties (so the feed isn't empty after setup) ---
  const existingPropertyCount = await Property.countDocuments();
  if (existingPropertyCount === 0) {
    const seller = await User.findOne({ email: sampleEmail });
    const allTypes = await PropertyType.find();
    const allCities = await City.find().populate('district');
    const typeByName = (name) => allTypes.find((t) => t.name === name)?._id;
    const cityByName = (name) => allCities.find((c) => c.name === name);

    const sampleProperties = [
      {
        title: 'Modern 4-Bedroom House in Kathmandu',
        description: 'A beautifully finished modern home close to the city center, featuring an open-plan living area, landscaped garden, and dedicated parking for two vehicles.',
        propertyType: typeByName('House'),
        saleType: 'sale',
        price: 25000000,
        negotiable: true,
        cityName: 'Kathmandu',
        municipality: 'Kathmandu Metropolitan City',
        wardNumber: '10',
        streetAddress: 'Baneshwor Marg',
        details: { landArea: 4, landAreaUnit: 'aana', builtUpArea: 2800, bedrooms: 4, bathrooms: 3, floors: 3, parkingSpaces: 2, facingDirection: 'East', roadAccess: '13 ft blacktopped', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'semi-furnished', constructionYear: 2019 },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1598228723793-52759bba239c?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Cozy 2-Bedroom Apartment in Lalitpur',
        description: 'Well-maintained apartment on the 4th floor with elevator access, close to schools, hospitals, and public transport.',
        propertyType: typeByName('Apartment'),
        saleType: 'sale',
        price: 9500000,
        negotiable: false,
        cityName: 'Lalitpur',
        municipality: 'Lalitpur Metropolitan City',
        wardNumber: '5',
        streetAddress: 'Jawalakhel',
        details: { builtUpArea: 1150, bedrooms: 2, bathrooms: 2, floors: 1, parkingSpaces: 1, facingDirection: 'North', roadAccess: '10 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'fully-furnished', constructionYear: 2021 },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1568822240459-9400e58f710f?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Residential Land Plot in Bhaktapur',
        description: 'Flat, ready-to-build residential plot in a quiet, developing neighborhood with clear road access on two sides.',
        propertyType: typeByName('Land'),
        saleType: 'sale',
        price: 6000000,
        negotiable: true,
        cityName: 'Bhaktapur',
        municipality: 'Bhaktapur Municipality',
        wardNumber: '3',
        streetAddress: 'Suryabinayak',
        details: { landArea: 6, landAreaUnit: 'aana', roadAccess: '16 ft blacktopped', facingDirection: 'South', waterSupply: false, electricity: true, internetAvailability: false },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1587745890135-20db8c79b027?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Commercial Space for Sale in Biratnagar',
        description: 'Ground-floor commercial unit on a busy street, ideal for a retail shop or showroom, with high foot traffic.',
        propertyType: typeByName('Commercial Space'),
        saleType: 'sale',
        price: 18000000,
        negotiable: true,
        cityName: 'Biratnagar',
        municipality: 'Biratnagar Metropolitan City',
        wardNumber: '2',
        streetAddress: 'Main Road',
        details: { builtUpArea: 2200, floors: 1, parkingSpaces: 3, roadAccess: '30 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'unfurnished' },
        status: 'reserved',
        image: 'https://images.unsplash.com/photo-1608053246173-86582477ca76?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Elegant Villa with Private Garden, Kathmandu',
        description: 'Spacious villa featuring high ceilings, a private garden, and a rooftop terrace with panoramic valley views.',
        propertyType: typeByName('Villa'),
        saleType: 'sale',
        price: 45000000,
        negotiable: false,
        cityName: 'Kathmandu',
        municipality: 'Kathmandu Metropolitan City',
        wardNumber: '4',
        streetAddress: 'Budhanilkantha',
        details: { landArea: 8, landAreaUnit: 'aana', builtUpArea: 4500, bedrooms: 5, bathrooms: 5, floors: 3, parkingSpaces: 3, facingDirection: 'East', roadAccess: '20 ft blacktopped', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'fully-furnished', constructionYear: 2022 },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Compact 1-Bedroom Apartment, Kirtipur',
        description: 'Affordable starter apartment close to Tribhuvan University, perfect for a small family or first-time buyer.',
        propertyType: typeByName('Apartment'),
        saleType: 'sale',
        price: 5200000,
        negotiable: true,
        cityName: 'Kirtipur',
        municipality: 'Kirtipur Municipality',
        wardNumber: '1',
        streetAddress: 'Nayabazar',
        details: { builtUpArea: 650, bedrooms: 1, bathrooms: 1, floors: 1, parkingSpaces: 0, facingDirection: 'West', roadAccess: '8 ft', waterSupply: true, electricity: true, internetAvailability: false, furnishedStatus: 'unfurnished', constructionYear: 2016 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1605640214887-5f1f80e46cd4?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Family House Near Godawari Botanical Garden',
        description: 'Peaceful semi-rural home surrounded by greenery, a short drive from Godawari Botanical Garden, with a large kitchen garden.',
        propertyType: typeByName('House'),
        saleType: 'sale',
        price: 13500000,
        negotiable: true,
        cityName: 'Godawari',
        municipality: 'Godawari Municipality',
        wardNumber: '9',
        streetAddress: 'Godawari Road',
        details: { landArea: 5, landAreaUnit: 'aana', builtUpArea: 2100, bedrooms: 3, bathrooms: 2, floors: 2, parkingSpaces: 2, facingDirection: 'South', roadAccess: '12 ft gravel', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'semi-furnished', constructionYear: 2015 },
        status: 'sold',
        image: 'https://images.unsplash.com/photo-1628624747186-a941c476b7ef?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Modern Duplex Apartment, Madhyapur Thimi',
        description: 'Two-storey duplex unit with a private terrace, tucked in a quiet residential complex with 24/7 security.',
        propertyType: typeByName('Apartment'),
        saleType: 'sale',
        price: 11800000,
        negotiable: false,
        cityName: 'Madhyapur Thimi',
        municipality: 'Madhyapur Thimi Municipality',
        wardNumber: '6',
        streetAddress: 'Sallaghari',
        details: { builtUpArea: 1600, bedrooms: 3, bathrooms: 2, floors: 2, parkingSpaces: 1, facingDirection: 'North-East', roadAccess: '10 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'fully-furnished', constructionYear: 2020 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1766227550187-bfe386773647?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Corner Plot Commercial Land, Lalitpur',
        description: 'Prime corner plot on a main road, zoned for commercial use, well suited for a showroom, bank branch, or office building.',
        propertyType: typeByName('Land'),
        saleType: 'sale',
        price: 32000000,
        negotiable: true,
        cityName: 'Lalitpur',
        municipality: 'Lalitpur Metropolitan City',
        wardNumber: '11',
        streetAddress: 'Satdobato',
        details: { landArea: 10, landAreaUnit: 'aana', roadAccess: '40 ft blacktopped', facingDirection: 'South-West', waterSupply: true, electricity: true, internetAvailability: false },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1747854805840-9be7d5e360e6?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Riverside Bungalow, Biratnagar',
        description: 'Single-storey bungalow with a large courtyard, just minutes from the riverside, offering a calm, green setting.',
        propertyType: typeByName('House'),
        saleType: 'sale',
        price: 9800000,
        negotiable: true,
        cityName: 'Biratnagar',
        municipality: 'Biratnagar Metropolitan City',
        wardNumber: '14',
        streetAddress: 'Rani Mills Road',
        details: { landArea: 6, landAreaUnit: 'aana', builtUpArea: 1900, bedrooms: 3, bathrooms: 2, floors: 1, parkingSpaces: 2, facingDirection: 'East', roadAccess: '14 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'semi-furnished', constructionYear: 2017 },
        status: 'reserved',
        image: 'https://images.unsplash.com/photo-1584738766473-61c083514bf4?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Traditional Newari Home Near Bhaktapur Durbar Square',
        description: 'A beautifully preserved traditional Newari house with hand-carved wooden windows, brick facade, and a courtyard, just a short walk from Bhaktapur Durbar Square. Full of heritage character with modern plumbing and wiring already in place.',
        propertyType: typeByName('Traditional Nepali Home'),
        saleType: 'sale',
        price: 21000000,
        negotiable: true,
        cityName: 'Bhaktapur',
        municipality: 'Bhaktapur Municipality',
        wardNumber: '7',
        streetAddress: 'Durbar Square Road',
        details: { landArea: 3, landAreaUnit: 'aana', builtUpArea: 2400, bedrooms: 4, bathrooms: 2, floors: 3, parkingSpaces: 0, facingDirection: 'East', roadAccess: '8 ft cobblestone', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'semi-furnished', constructionYear: 1985 },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1650731657583-c97ae3e9916b?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Heritage Newari House, Patan Durbar Area, Lalitpur',
        description: 'Classic Newari-style residence with traditional tiled roofing and intricately carved wooden struts, located in the historic core of Patan. Ideal for a boutique guesthouse or a family who values heritage architecture.',
        propertyType: typeByName('Traditional Nepali Home'),
        saleType: 'sale',
        price: 26500000,
        negotiable: false,
        cityName: 'Lalitpur',
        municipality: 'Lalitpur Metropolitan City',
        wardNumber: '15',
        streetAddress: 'Mangal Bazaar',
        details: { landArea: 4, landAreaUnit: 'aana', builtUpArea: 3100, bedrooms: 5, bathrooms: 3, floors: 3, parkingSpaces: 1, facingDirection: 'North', roadAccess: '10 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'unfurnished', constructionYear: 1978 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1634150527341-56267a30704d?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Lakeview Land Plot, Pokhara Lakeside',
        description: 'Rare residential plot just a few minutes from Phewa Lake with stunning views toward the Annapurna range. Ideal for a home, boutique hotel, or resort project.',
        propertyType: typeByName('Land'),
        saleType: 'sale',
        price: 38000000,
        negotiable: true,
        cityName: 'Pokhara',
        municipality: 'Pokhara Metropolitan City',
        wardNumber: '6',
        streetAddress: 'Lakeside Road',
        details: { landArea: 9, landAreaUnit: 'aana', roadAccess: '20 ft blacktopped', facingDirection: 'North-West', waterSupply: true, electricity: true, internetAvailability: true },
        status: 'available',
        isFeatured: true,
        image: 'https://images.unsplash.com/photo-1653663786108-21ca52a24171?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Agricultural Land in Pokhara Valley',
        description: 'Fertile bench-terrace agricultural land on the outskirts of Pokhara, currently under active cultivation, with year-round irrigation access and a seasonal stream along one boundary.',
        propertyType: typeByName('Land'),
        saleType: 'sale',
        price: 4200000,
        negotiable: true,
        cityName: 'Pokhara',
        municipality: 'Pokhara Metropolitan City',
        wardNumber: '24',
        streetAddress: 'Hemja',
        details: { landArea: 15, landAreaUnit: 'ropani', roadAccess: '6 ft gravel', facingDirection: 'South', waterSupply: true, electricity: false, internetAvailability: false },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1506695041619-5dd4f46960b7?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Ready-to-Build Residential Plot, Kirtipur',
        description: 'Level residential plot in a settled, family-friendly neighborhood close to Tribhuvan University, with all utility lines already available at the roadside.',
        propertyType: typeByName('Land'),
        saleType: 'sale',
        price: 8800000,
        negotiable: true,
        cityName: 'Kirtipur',
        municipality: 'Kirtipur Municipality',
        wardNumber: '2',
        streetAddress: 'Panga',
        details: { landArea: 4.5, landAreaUnit: 'aana', roadAccess: '13 ft blacktopped', facingDirection: 'East', waterSupply: true, electricity: true, internetAvailability: true },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1586859821397-c81e4971ca82?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Stone & Timber Hill House, Godawari',
        description: 'A Pahadi-style hill house built from local stone and timber, set on a terraced slope with panoramic views over the valley. Combines traditional hill construction with a modern interior fit-out.',
        propertyType: typeByName('Traditional Nepali Home'),
        saleType: 'sale',
        price: 15800000,
        negotiable: true,
        cityName: 'Godawari',
        municipality: 'Godawari Municipality',
        wardNumber: '4',
        streetAddress: 'Bhardev Marg',
        details: { landArea: 7, landAreaUnit: 'aana', builtUpArea: 1700, bedrooms: 3, bathrooms: 2, floors: 2, parkingSpaces: 1, facingDirection: 'South-East', roadAccess: '10 ft gravel', waterSupply: true, electricity: true, internetAvailability: false, furnishedStatus: 'semi-furnished', constructionYear: 2012 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Terai-Style Home with Wide Veranda, Biratnagar',
        description: 'Single-storey Terai-style home with a wide covered veranda, high ceilings for natural cooling, and a spacious plot ideal for a kitchen garden. A classic Madhesh-region layout close to the city center.',
        propertyType: typeByName('Traditional Nepali Home'),
        saleType: 'sale',
        price: 11200000,
        negotiable: true,
        cityName: 'Biratnagar',
        municipality: 'Biratnagar Metropolitan City',
        wardNumber: '5',
        streetAddress: 'Traffic Chowk Road',
        details: { landArea: 8, landAreaUnit: 'aana', builtUpArea: 1850, bedrooms: 3, bathrooms: 2, floors: 1, parkingSpaces: 2, facingDirection: 'South', roadAccess: '16 ft blacktopped', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'unfurnished', constructionYear: 2009 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&h=600&q=80',
      },
    ];

    // Approximate city-center coordinates for the seed data's map pins. A real
    // listing's owner would drop a precise pin (now easy via "Use my current
    // location" on the Add/Edit Property form), but seed data needs *some*
    // coordinate so these properties satisfy the same map-location requirement
    // enforced on every real submission.
    const CITY_COORDINATES = {
      Kathmandu: { lat: 27.7172, lng: 85.3240 },
      Kirtipur: { lat: 27.6764, lng: 85.2775 },
      Lalitpur: { lat: 27.6588, lng: 85.3247 },
      Godawari: { lat: 27.5972, lng: 85.3936 },
      Bhaktapur: { lat: 27.6710, lng: 85.4298 },
      'Madhyapur Thimi': { lat: 27.6810, lng: 85.3850 },
      Biratnagar: { lat: 26.4525, lng: 87.2718 },
      Pokhara: { lat: 28.2096, lng: 83.9856 },
    };

    for (const item of sampleProperties) {
      const cityDoc = cityByName(item.cityName);
      await Property.create({
        title: item.title,
        description: item.description,
        propertyType: item.propertyType,
        saleType: item.saleType,
        price: item.price,
        currency: 'NPR',
        negotiable: item.negotiable,
        location: {
          country: 'Nepal',
          province: cityDoc?.district?.province || '',
          district: cityDoc?.district?._id,
          city: cityDoc?._id,
          municipality: item.municipality,
          wardNumber: item.wardNumber,
          streetAddress: item.streetAddress,
          mapLocation: CITY_COORDINATES[item.cityName] || undefined,
        },
        details: item.details,
        media: {
          coverImage: item.image,
          images: [item.image],
        },
        status: item.status,
        isFeatured: !!item.isFeatured,
        listedBy: seller._id,
      });
    }
    console.log(`${sampleProperties.length} sample properties seeded.`);
  } else {
    console.log('Properties already exist, skipping sample property seeding.');
  }

  console.log('Seeding complete.');
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
