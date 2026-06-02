const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');

const MONGO_URI = process.env.MONGO_URI;
const STORE = 'store_1';

// -------------------------------
// 20 REALISTIC SKUS
// -------------------------------
const catalog = [
  { sku: 'SKU002', name: 'Whole Milk 1L', category: 'Dairy', base: 40 },
  { sku: 'SKU003', name: 'Instant Noodles', category: 'Snacks', base: 55 },
  { sku: 'SKU004', name: 'Wheat Flour 5kg', category: 'Grains', base: 30 },
  { sku: 'SKU005', name: 'Cooking Oil 1L', category: 'Oil', base: 35 },
  { sku: 'SKU006', name: 'Sugar 1kg', category: 'Essentials', base: 28 },
  { sku: 'SKU007', name: 'Salt 1kg', category: 'Essentials', base: 22 },
  { sku: 'SKU008', name: 'Tea Powder', category: 'Beverages', base: 33 },
  { sku: 'SKU009', name: 'Coffee Powder', category: 'Beverages', base: 18 },
  { sku: 'SKU010', name: 'Biscuits Pack', category: 'Snacks', base: 45 },
  { sku: 'SKU011', name: 'Soap Bar', category: 'Hygiene', base: 20 },
  { sku: 'SKU012', name: 'Shampoo 200ml', category: 'Hygiene', base: 15 },
  { sku: 'SKU013', name: 'Toothpaste', category: 'Hygiene', base: 25 },
  { sku: 'SKU014', name: 'Bread', category: 'Bakery', base: 50 },
  { sku: 'SKU015', name: 'Eggs (12 pack)', category: 'Protein', base: 60 },
  { sku: 'SKU016', name: 'Butter 100g', category: 'Dairy', base: 22 },
  { sku: 'SKU017', name: 'Cheese Slice', category: 'Dairy', base: 18 },
  { sku: 'SKU018', name: 'Chocolate Bar', category: 'Snacks', base: 42 },
  { sku: 'SKU019', name: 'Cold Drink 500ml', category: 'Beverages', base: 65 },
  { sku: 'SKU020', name: 'Detergent Powder', category: 'Cleaning', base: 38 }
];

// -------------------------------
// DEMAND PATTERN GENERATOR
// -------------------------------
function generateQty(base, dayIndex, skuIndex) {
  const weekly = Math.sin(dayIndex / 7) * 6;
  const noise = Math.random() * 5;

  // category variation
  const categoryFactor = (skuIndex % 5) * 2;

  return Math.max(5, Math.round(base + weekly + noise + categoryFactor));
}

// -------------------------------
// SALES GENERATOR
// -------------------------------
function generateSales(productId, sku, base, skuIndex) {
  const sales = [];
  const today = new Date();

  for (let d = 0; d < 90; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);

    const qty = generateQty(base, d, skuIndex);

    sales.push({
      product: productId,
      quantity: qty,
      saleDate: date,
      storeId: STORE
    });
  }

  return sales;
}

// -------------------------------
// MAIN
// -------------------------------
async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  await Sale.deleteMany({ storeId: STORE });

  let allSales = [];

  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];

    const product = await Product.findOneAndUpdate(
      { sku: item.sku },
      {
        sku: item.sku,
        name: item.name,
        category: item.category,
        sellingPrice: item.base * 10,
        costPrice: item.base * 7,
        holdingCost: 2,
        reorderPoint: 30,
        totalStock: 100
      },
      { upsert: true, new: true }
    );

    await Inventory.findOneAndUpdate(
      { sku: item.sku },
      {
        sku: item.sku,
        name: item.name,
        category: item.category,
        price: item.base * 10,
        quantity: 100
      },
      { upsert: true }
    );

    const sales = generateSales(product._id, item.sku, item.base, i);
    allSales.push(...sales);
  }

  await Sale.insertMany(allSales);

  console.log(`Inserted ${allSales.length} sales records for 20 SKUs`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => {
  console.error(err);
});