const express = require('express');
const router = express.Router();
const { getWallet, getTransactions } = require('../controllers/rewardController');
const { protect } = require('../middleware/auth');

router.get('/wallet', protect, getWallet);
router.get('/transactions', protect, getTransactions);

module.exports = router;
