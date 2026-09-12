const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.get('/', verifyToken, categoryController.getCategories);

module.exports = router;
