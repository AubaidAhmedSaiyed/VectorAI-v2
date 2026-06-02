require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');

const MONGO_URI = process.env.MONGO_URI;

const SKUS = [
  'SKU001','SKU002','SKU003','SKU004','SKU005',
  'SKU006','SKU007','SKU008','SKU009','SKU010',
  'SKU011','SKU012','SKU013','SKU014','SKU015',
  'SKU016','SKU017','SKU018','SKU019','SKU020'
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Delete products
  const p = await Product.deleteMany({ sku: { $in: SKUS } });
  console.log('Deleted Products:', p.deletedCount);

  // 2. Delete inventory
  const i = await Inventory.deleteMany({ sku: { $in: SKUS } });
  console.log('Deleted Inventory:', i.deletedCount);

  // 3. Delete sales (important for ML reset)
  const s = await Sale.deleteMany({ storeId: 'store_1' });
  console.log('Deleted Sales:', s.deletedCount);

  await mongoose.disconnect();
  console.log('Cleanup Done');
}

run().catch(err => {
  console.error(err);
});