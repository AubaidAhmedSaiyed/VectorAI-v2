/**
 * Seed demo users, products, inventory, and sales for local development / QA.
 * Usage: from backend/ → npm run seed
 * Requires MONGO_URI in .env (same as server).
 */
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
  console.log('Users: admin@retail.com / admin123, staff@retail.com / staff123');

  const catalog = [
    {
      name: 'Organic Rice 5kg',
      sku: 'SKU001',
      category: 'Grains',
      sellingPrice: 450,
      costPrice: 320,
      holdingCost: 2,
      reorderPoint: 40,
      totalStock: 120,
    },
    {
      name: 'Whole Milk 1L',
      sku: 'SKU002',
      category: 'Dairy',
      sellingPrice: 60,
      costPrice: 48,
      holdingCost: 0.5,
      reorderPoint: 30,
      totalStock: 80,
    },
    {
      name: 'Instant Noodles',
      sku: 'SKU003',
      category: 'Snacks',
      sellingPrice: 20,
      costPrice: 12,
      holdingCost: 0.2,
      reorderPoint: 50,
      totalStock: 200,
    },
  ];

  for (const row of catalog) {
    await Product.findOneAndUpdate(
      { sku: row.sku },
      { $set: { ...row, safetyStock: 5, leadTime: 2 } },
      { upsert: true, new: true }
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
  console.log('Products + inventory upserted (SKU001–SKU003)');

  const products = await Product.find({ sku: { $in: ['SKU001', 'SKU002', 'SKU003'] } }).lean();
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

  const saleCount = await Sale.countDocuments({ storeId: STORE });
  if (saleCount < 24) {
    const docs = [];
    const today = new Date();
    for (let w = 12; w >= 0; w--) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      for (const sku of ['SKU001', 'SKU002', 'SKU003']) {
        const p = bySku[sku];
        if (!p) continue;
        const base = sku === 'SKU001' ? 25 : sku === 'SKU002' ? 40 : 55;
        const qty = base + ((w + sku.charCodeAt(3)) % 9);
        docs.push({
          product: p._id,
          quantity: qty,
          saleDate: d,
          storeId: STORE,
        });
      }
    }
    await Sale.insertMany(docs);
    console.log(`Inserted ${docs.length} weekly sales rows for ML (${STORE})`);
  } else {
    console.log('Sales already present; skipping bulk insert');
  }

  const recentCount = await Sale.countDocuments({
    storeId: STORE,
    saleDate: { $gte: new Date(Date.now() - 2 * 86400000) },
  });
  if (recentCount < 4) {
    const p1 = bySku.SKU001;
    const p2 = bySku.SKU002;
    const p3 = bySku.SKU003;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(14, 30, 0, 0);
    const t = new Date();
    t.setHours(11, 0, 0, 0);
    const extra = [];
    if (p1) extra.push({ product: p1._id, quantity: 10, saleDate: y, storeId: STORE });
    if (p2) extra.push({ product: p2._id, quantity: 28, saleDate: y, storeId: STORE });
    if (p1) extra.push({ product: p1._id, quantity: 6, saleDate: t, storeId: STORE });
    if (p2) extra.push({ product: p2._id, quantity: 35, saleDate: t, storeId: STORE });
    if (p3) extra.push({ product: p3._id, quantity: 18, saleDate: t, storeId: STORE });
    if (extra.length) {
      await Sale.insertMany(extra);
      console.log(`Inserted ${extra.length} sales for yesterday/today (dashboard revenue)`);
    }
  }

  const mlRows = await Sale.find({ storeId: STORE })
    .populate('product', 'sku')
    .lean();
  const mlData = mlRows
    .filter((s) => s.product?.sku)
    .map((s) => ({
      date: new Date(s.saleDate).toISOString().split('T')[0],
      sku_id: s.product.sku,
      sales: s.quantity,
    }));

  const ML = process.env.ML_ENGINE_URL || 'http://127.0.0.1:8000';
  try {
    const health = await fetch(`${ML}/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`health ${health.status}`);
    const trainRes = await fetch(`${ML}/train/${encodeURIComponent(STORE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: mlData }),
      signal: AbortSignal.timeout(180000),
    });
    const trainJson = await trainRes.json().catch(() => ({}));
    if (!trainRes.ok) {
      console.warn('[seed] ML train failed:', trainRes.status, trainJson);
    } else {
      console.log('[seed] ML train summary:', trainJson.summary || trainJson);
    }
  } catch (e) {
    console.log('[seed] ML train skipped (optional):', e.message);
    console.log('      Start the Python engine on port 8000, then: POST /api/ml/train/store_1 with auth');
  }

  console.log('\nDone. For curl without a JWT, set AUTH_DISABLED=true in backend/.env');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
