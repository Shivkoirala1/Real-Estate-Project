// test-cloudinary.js
// Quick standalone test to confirm your Cloudinary credentials actually work.
// Run this INSIDE your backend folder with: node test-cloudinary.js

require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Testing with:');
console.log('CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API_KEY:', process.env.CLOUDINARY_API_KEY);
console.log('API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '(set, hidden)' : 'MISSING!');

cloudinary.uploader.upload(
  'https://res.cloudinary.com/demo/image/upload/sample.jpg', // a public test image
  { folder: 'test-upload' },
  (error, result) => {
    if (error) {
      console.log('❌ FAILED. Cloudinary rejected this:');
      console.log(error);
    } else {
      console.log('✅ SUCCESS! Image uploaded:');
      console.log(result.secure_url);
    }
  }
);