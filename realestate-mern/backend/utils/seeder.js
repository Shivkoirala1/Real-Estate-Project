// Seeds the database with fixed demo accounts, property types, districts
// (from the canonical backend/data/nepalGeography.js dataset) and sample
// properties so the app is usable immediately after setup.
// Run with: npm run seed

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Property = require('../models/Property');
const { PropertyType, District } = require('../models/Category');
const { PROVINCES, DISTRICTS } = require('../data/nepalGeography');

const run = async () => {
  await connectDB();

  // --- Demo accounts with fixed IDs (stable across re-seeds and
  // environments). Matched by _id first so re-running never duplicates;
  // falls back to the existing email owner if one is already present.
  const seedUsers = [
    { _id: '6aaf97c407df8101d6a10909', name: 'System Admin', email: 'admin@realestate.com', password: 'Admin@123', role: 'admin' },
    { _id: '6aafa5e778cdf6823d2af56a', name: 'Test Agent', email: 'agent@realestate.com', password: 'Agent@123', role: 'agent' },
    { _id: '6aafb9bd836b4b140a02bbae', name: 'Test User', email: 'user@realestate.com', password: 'User@123', role: 'user' },
  ];
  const listers = [];
  for (const u of seedUsers) {
    let doc = await User.findById(u._id);
    if (!doc) {
      doc = await User.findOne({ email: u.email });
      if (!doc) {
        doc = await User.create({
          ...u,
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          isEmailVerified: true,
        });
        console.log(`User created -> ${u.name} / email: ${u.email}`);
      } else {
        console.log(`User ${u.email} already exists (different _id), reusing it.`);
      }
    } else {
      console.log(`User ${u.name} already exists, skipping.`);
    }
    listers.push(doc._id);
  }

  // --- Property Types --- "Land" is the only one that gets the practical
  // land-specific posting form; everything else is a building.
  const propertyTypes = [
    { name: 'House', category: 'building' },
    { name: 'Apartment', category: 'building' },
    { name: 'Land', category: 'land' },
    { name: 'Commercial Space', category: 'building' },
    { name: 'Agricultural Land', category: 'land' },
    { name: 'Residential Plot', category: 'land' },
  ];
  for (const { name, category } of propertyTypes) {
    await PropertyType.updateOne({ name }, { name, category }, { upsert: true });
  }
  console.log('Property types seeded.');

  // --- Districts: the canonical Province -> District -> Municipality
  // dataset (backend/data/nepalGeography.js). Only districts seed here —
  // properties reference district/municipality names directly, so no
  // legacy City documents are created.
  for (const [districtName, { province }] of Object.entries(DISTRICTS)) {
    await District.findOneAndUpdate(
      { name: districtName },
      { name: districtName, province },
      { upsert: true, new: true }
    );
  }
  console.log(`Districts seeded (${Object.keys(DISTRICTS).length} districts across ${PROVINCES.length} provinces).`);

  // --- Sample Properties (so the feed isn't empty after setup) ---
  // Title-keyed: only missing samples are created, so re-running tops up a
  // partial seed (e.g. after a crash) without duplicating existing rows.
  {
    const allTypes = await PropertyType.find();
    const typeByName = (name) => allTypes.find((t) => t.name === name)?._id;

    const sampleProperties = [
      {
        title: 'Modern 4-Bedroom House in Kathmandu',
        description: 'A beautifully finished modern home close to the city center, featuring an open-plan living area, landscaped garden, and dedicated parking for two vehicles.',
        propertyType: typeByName('House'),
        saleType: 'sale',
        price: 25000000,
        negotiable: true,
        district: 'Kathmandu',
        locality: 'Kathmandu',
        municipality: 'Kathmandu',
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
        district: 'Lalitpur',
        locality: 'Lalitpur',
        municipality: 'Lalitpur',
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
        district: 'Bhaktapur',
        locality: 'Bhaktapur',
        municipality: 'Bhaktapur',
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
        district: 'Morang',
        locality: 'Biratnagar',
        municipality: 'Biratnagar',
        wardNumber: '2',
        streetAddress: 'Main Road',
        details: { builtUpArea: 2200, floors: 1, parkingSpaces: 3, roadAccess: '30 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'unfurnished' },
        status: 'reserved',
        image: 'https://images.unsplash.com/photo-1608053246173-86582477ca76?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Elegant Villa with Private Garden, Kathmandu',
        description: 'Spacious villa featuring high ceilings, a private garden, and a rooftop terrace with panoramic valley views.',
        propertyType: typeByName('House'), // Villa lives under House (building)
        saleType: 'sale',
        price: 45000000,
        negotiable: false,
        district: 'Kathmandu',
        locality: 'Kathmandu',
        municipality: 'Kathmandu',
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
        district: 'Kathmandu',
        locality: 'Kirtipur',
        municipality: 'Kirtipur',
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
        district: 'Lalitpur',
        locality: 'Godawari',
        municipality: 'Godawari',
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
        district: 'Bhaktapur',
        locality: 'Madhyapur Thimi',
        municipality: 'Madhyapur Thimi',
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
        district: 'Lalitpur',
        locality: 'Lalitpur',
        municipality: 'Lalitpur',
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
        district: 'Morang',
        locality: 'Biratnagar',
        municipality: 'Biratnagar',
        wardNumber: '14',
        streetAddress: 'Rani Mills Road',
        details: { landArea: 6, landAreaUnit: 'aana', builtUpArea: 1900, bedrooms: 3, bathrooms: 2, floors: 1, parkingSpaces: 2, facingDirection: 'East', roadAccess: '14 ft', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'semi-furnished', constructionYear: 2017 },
        status: 'reserved',
        image: 'https://images.unsplash.com/photo-1584738766473-61c083514bf4?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Traditional Newari Home Near Bhaktapur Durbar Square',
        description: 'A beautifully preserved traditional Newari house with hand-carved wooden windows, brick facade, and a courtyard, just a short walk from Bhaktapur Durbar Square. Full of heritage character with modern plumbing and wiring already in place.',
        propertyType: typeByName('House'), // Traditional homes live under House (building)
        saleType: 'sale',
        price: 21000000,
        negotiable: true,
        district: 'Bhaktapur',
        locality: 'Bhaktapur',
        municipality: 'Bhaktapur',
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
        propertyType: typeByName('House'), // Traditional homes live under House (building)
        saleType: 'sale',
        price: 26500000,
        negotiable: false,
        district: 'Lalitpur',
        locality: 'Lalitpur',
        municipality: 'Lalitpur',
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
        district: 'Kaski',
        locality: 'Pokhara',
        municipality: 'Pokhara',
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
        district: 'Kaski',
        locality: 'Pokhara',
        municipality: 'Pokhara',
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
        district: 'Kathmandu',
        locality: 'Kirtipur',
        municipality: 'Kirtipur',
        wardNumber: '2',
        streetAddress: 'Panga',
        details: { landArea: 4.5, landAreaUnit: 'aana', roadAccess: '13 ft blacktopped', facingDirection: 'East', waterSupply: true, electricity: true, internetAvailability: true },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1586859821397-c81e4971ca82?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Stone & Timber Hill House, Godawari',
        description: 'A Pahadi-style hill house built from local stone and timber, set on a terraced slope with panoramic views over the valley. Combines traditional hill construction with a modern interior fit-out.',
        propertyType: typeByName('House'), // Traditional homes live under House (building)
        saleType: 'sale',
        price: 15800000,
        negotiable: true,
        district: 'Lalitpur',
        locality: 'Godawari',
        municipality: 'Godawari',
        wardNumber: '4',
        streetAddress: 'Bhardev Marg',
        details: { landArea: 7, landAreaUnit: 'aana', builtUpArea: 1700, bedrooms: 3, bathrooms: 2, floors: 2, parkingSpaces: 1, facingDirection: 'South-East', roadAccess: '10 ft gravel', waterSupply: true, electricity: true, internetAvailability: false, furnishedStatus: 'semi-furnished', constructionYear: 2012 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=900&h=600&q=80',
      },
      {
        title: 'Terai-Style Home with Wide Veranda, Biratnagar',
        description: 'Single-storey Terai-style home with a wide covered veranda, high ceilings for natural cooling, and a spacious plot ideal for a kitchen garden. A classic Madhesh-region layout close to the city center.',
        propertyType: typeByName('House'), // Traditional homes live under House (building)
        saleType: 'sale',
        price: 11200000,
        negotiable: true,
        district: 'Morang',
        locality: 'Biratnagar',
        municipality: 'Biratnagar',
        wardNumber: '5',
        streetAddress: 'Traffic Chowk Road',
        details: { landArea: 8, landAreaUnit: 'aana', builtUpArea: 1850, bedrooms: 3, bathrooms: 2, floors: 1, parkingSpaces: 2, facingDirection: 'South', roadAccess: '16 ft blacktopped', waterSupply: true, electricity: true, internetAvailability: true, furnishedStatus: 'unfurnished', constructionYear: 2009 },
        status: 'available',
        image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&h=600&q=80',
      },
    ];

    // Approximate locality-center coordinates for the seed data's map pins.
    // A real listing's owner drops a precise pin on the Add/Edit Property
    // form; seed data just needs a plausible coordinate per locality.
    const LOCALITY_COORDINATES = {
      Kathmandu: { lat: 27.7172, lng: 85.3240 },
      Kirtipur: { lat: 27.6764, lng: 85.2775 },
      Lalitpur: { lat: 27.6588, lng: 85.3247 },
      Godawari: { lat: 27.5972, lng: 85.3936 },
      Bhaktapur: { lat: 27.6710, lng: 85.4298 },
      'Madhyapur Thimi': { lat: 27.6810, lng: 85.3850 },
      Biratnagar: { lat: 26.4525, lng: 87.2718 },
      Pokhara: { lat: 28.2096, lng: 83.9856 },
    };

    let created = 0;
    for (const item of sampleProperties) {
      // Province is derived from the canonical dataset — never hardcoded —
      // so a mistyped district fails loudly instead of seeding bad data.
      // Same for the property type: fail here with the sample title rather
      // than a cryptic mongoose validation error three lines later.
      if (!item.propertyType) throw new Error(`Seeder: unknown property type for "${item.title}"`);
      if (await Property.exists({ title: item.title })) {
        continue;
      }
      const province = DISTRICTS[item.district]?.province;
      if (!province) throw new Error(`Seeder: unknown district "${item.district}" for "${item.title}"`);
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
          province,
          district: item.district,
          municipality: item.municipality,
          locality: item.locality,
          wardNumber: item.wardNumber,
          streetAddress: item.streetAddress,
          mapLocation: LOCALITY_COORDINATES[item.locality] || undefined,
        },
        details: item.details,
        media: {
          coverImage: item.image,
          images: [item.image],
        },
        status: item.status,
        isFeatured: !!item.isFeatured,
        // Spread listings across the demo admin / agent / user accounts.
        listedBy: listers[Math.floor(Math.random() * listers.length)],
      });
      created += 1;
    }
    console.log(`Sample properties seeded (${created} new, ${sampleProperties.length - created} already present).`);
  }

  console.log('Seeding complete.');
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
