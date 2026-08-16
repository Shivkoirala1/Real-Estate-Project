const express = require('express');
const router = express.Router();
const {
  getPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  getDistricts,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  findOrCreateDistrict,
  getCities,
  createCity,
  updateCity,
  deleteCity,
  findOrCreateCity,
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

// Public read access - needed for search/filter UI and add-property forms
router.get('/property-types', getPropertyTypes);
router.get('/districts', getDistricts);
router.get('/cities', getCities);

// Cities: any logged-in user can add one that's missing while posting a
// property (e.g. a smaller town not yet in the list) - it's saved
// permanently so every future user sees it too. Districts stay admin-only
// since Nepal's official district list is fixed and complete.
router.post('/districts/find-or-create', protect, authorize('admin'), findOrCreateDistrict);
router.post('/cities/find-or-create', protect, findOrCreateCity);

// Admin-only write access
router.post('/property-types', protect, authorize('admin'), createPropertyType);
router.put('/property-types/:id', protect, authorize('admin'), updatePropertyType);
router.delete('/property-types/:id', protect, authorize('admin'), deletePropertyType);

router.post('/districts', protect, authorize('admin'), createDistrict);
router.put('/districts/:id', protect, authorize('admin'), updateDistrict);
router.delete('/districts/:id', protect, authorize('admin'), deleteDistrict);

router.post('/cities', protect, authorize('admin'), createCity);
router.put('/cities/:id', protect, authorize('admin'), updateCity);
router.delete('/cities/:id', protect, authorize('admin'), deleteCity);

module.exports = router;
