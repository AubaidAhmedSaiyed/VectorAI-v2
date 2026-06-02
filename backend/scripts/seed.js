require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI missing in backend/.env');
  process.exit(1);
}

const STORE = 'store_1';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ─────────────────────────────
  // USERS
  // ─────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 10);
  const staffHash = await bcrypt.hash('staff123', 10);

  await User.findOneAndUpdate(
    { email: 'admin@retail.com' },
    {
      $set: {
        name: 'Demo Admin',
        email: 'admin@retail.com',
        passwordHash: adminHash,
        role: 'admin',
      },
    },
    { upsert: true }
  );

  await User.findOneAndUpdate(
    { email: 'staff@retail.com' },
    {
      $set: {
        name: 'Demo Staff',
        email: 'staff@retail.com',
        passwordHash: staffHash,
        role: 'staff',
      },
    },
    { upsert: true }
  );

  console.log('Users seeded');

  // ─────────────────────────────
  // PRODUCTS (20 SKUs)
  // ─────────────────────────────
  const catalog = [
    { name:'Organic Rice 5kg', sku:'SKU001', category:'Grains', sellingPrice:450, costPrice:320, holdingCost:2, reorderPoint:40, totalStock:120 },
    { name:'Whole Milk 1L', sku:'SKU002', category:'Dairy', sellingPrice:60, costPrice:48, holdingCost:0.5, reorderPoint:30, totalStock:80 },
    { name:'Instant Noodles', sku:'SKU003', category:'Snacks', sellingPrice:20, costPrice:12, holdingCost:0.2, reorderPoint:50, totalStock:200 },
    { name:'Sugar 1kg', sku:'SKU004', category:'Grocery', sellingPrice:45, costPrice:38, holdingCost:0.3, reorderPoint:60, totalStock:150 },
    { name:'Salt 1kg', sku:'SKU005', category:'Grocery', sellingPrice:20, costPrice:12, holdingCost:0.2, reorderPoint:70, totalStock:180 },
    { name:'Sunflower Oil 1L', sku:'SKU006', category:'Oil', sellingPrice:150, costPrice:120, holdingCost:1, reorderPoint:25, totalStock:90 },
    { name:'Wheat Flour 5kg', sku:'SKU007', category:'Grains', sellingPrice:220, costPrice:180, holdingCost:1.5, reorderPoint:40, totalStock:110 },
    { name:'Tea Powder 500g', sku:'SKU008', category:'Beverages', sellingPrice:120, costPrice:90, holdingCost:0.8, reorderPoint:35, totalStock:95 },
    { name:'Coffee Powder 200g', sku:'SKU009', category:'Beverages', sellingPrice:180, costPrice:140, holdingCost:0.9, reorderPoint:20, totalStock:60 },
    { name:'Biscuits Pack', sku:'SKU010', category:'Snacks', sellingPrice:30, costPrice:20, holdingCost:0.1, reorderPoint:80, totalStock:250 },
    { name:'Chocolate Bar', sku:'SKU011', category:'Snacks', sellingPrice:50, costPrice:35, holdingCost:0.2, reorderPoint:70, totalStock:200 },
    { name:'Toothpaste', sku:'SKU012', category:'Hygiene', sellingPrice:60, costPrice:45, holdingCost:0.3, reorderPoint:30, totalStock:120 },
    { name:'Soap Bar', sku:'SKU013', category:'Hygiene', sellingPrice:25, costPrice:15, holdingCost:0.1, reorderPoint:100, totalStock:300 },
    { name:'Shampoo 200ml', sku:'SKU014', category:'Hygiene', sellingPrice:110, costPrice:85, holdingCost:0.4, reorderPoint:25, totalStock:80 },
    { name:'Body Lotion', sku:'SKU015', category:'Hygiene', sellingPrice:140, costPrice:110, holdingCost:0.5, reorderPoint:20, totalStock:70 },
    { name:'Bread Loaf', sku:'SKU016', category:'Bakery', sellingPrice:40, costPrice:28, holdingCost:0.2, reorderPoint:50, totalStock:100 },
    { name:'Butter 100g', sku:'SKU017', category:'Dairy', sellingPrice:55, costPrice:42, holdingCost:0.3, reorderPoint:40, totalStock:90 },
    { name:'Cheese Slices', sku:'SKU018', category:'Dairy', sellingPrice:90, costPrice:70, holdingCost:0.4, reorderPoint:30, totalStock:60 },
    { name:'Soft Drink 1L', sku:'SKU019', category:'Beverages', sellingPrice:60, costPrice:45, holdingCost:0.3, reorderPoint:60, totalStock:140 },
    { name:'Mineral Water 1L', sku:'SKU020', category:'Beverages', sellingPrice:20, costPrice:10, holdingCost:0.1, reorderPoint:100, totalStock:400 },
  ];

  for (const row of catalog) {
    await Product.findOneAndUpdate(
      { sku: row.sku },
      { $set: { ...row, safetyStock: 5, leadTime: 2 } },
      { upsert: true }
    );

    await Inventory.findOneAndUpdate(
      { sku: row.sku },
      {
        $set: {
          name: row.name,
          sku: row.sku,
          category: row.category,
          price: row.sellingPrice,
          quantity: row.totalStock,
        },
      },
      { upsert: true }
    );
  }

  console.log('Products + Inventory seeded (20 SKUs)');

  // ─────────────────────────────
  // SALES GENERATION (ML DATA)
  // ─────────────────────────────
  const products = await Product.find({ sku: { $in: catalog.map(c => c.sku) } }).lean();
  const bySku = Object.fromEntries(products.map(p => [p.sku, p]));

  const saleCount = await Sale.countDocuments({ storeId: STORE });

  if (saleCount < 100) {
    const docs = [];
    const today = new Date();

    for (let w = 20; w >= 0; w--) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);

      for (const sku of catalog.map(c => c.sku)) {
        const p = bySku[sku];
        if (!p) continue;

        const base = (sku.charCodeAt(3) % 30) + 10;
        const qty = base + ((w + sku.charCodeAt(3)) % 7);

        docs.push({
          product: p._id,
          quantity: qty,
          saleDate: d,
          storeId: STORE,
        });
      }
    }

    await Sale.insertMany(docs);
    console.log(`Inserted ${docs.length} sales rows for ML`);
  }

  console.log('Seed complete');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});