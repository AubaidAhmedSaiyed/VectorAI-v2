const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });


const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const multer     = require('multer');
const csv        = require('csv-parser');
const fs         = require('fs');
const os         = require('os');
const XLSX       = require('xlsx');

// ─── Models ───────────────────────────────────────────────────────────────────
const Inventory     = require('./models/Inventory');
const Sale          = require('./models/Sale');
const Product       = require('./models/Product');
const Batch         = require('./models/Batch');
const PurchaseOrder = require('./models/PurchaseOrder');
const PredictionLog = require('./models/PredictionLog');

// ─── ML Service ───────────────────────────────────────────────────────────────
const { trainModels, getForecast, healthCheck, predictDemand } = require('./services/mlService');

const app       = express();
const PORT      = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI is missing. Add it in backend/.env');
  process.exit(1);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

// ─── Upload Dir ───────────────────────────────────────────────────────────────
const uploadsDir = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? os.tmpdir() : path.join(__dirname, 'uploads'));
if (uploadsDir !== os.tmpdir() && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const parseNum = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const validateObjectId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid ID format' });
  return next();
};

// Wilson EOQ formula
function computeEOQ(total4WeekDemand, orderingCost = 50, holdingCost = 2) {
  const D = total4WeekDemand * 13;
  if (holdingCost <= 0 || orderingCost <= 0) return null;
  return Math.round(Math.sqrt((2 * D * orderingCost) / holdingCost));
}

/**
 * EOQ + simple profit/holding illustration for presentation UI (builds on Python comparison.*).
 */
function buildPredictInsights(prediction, { orderingCost, holdingCost, unitMargin }) {
  if (!prediction?.eoq_hint) return null;

  const ml4 = Number(prediction.eoq_hint.total_4_week_demand);
  const naive4 = prediction.comparison?.totals_four_week?.without_ml_naive;
  const eoqMl = computeEOQ(ml4, orderingCost, holdingCost);
  const eoqNaive =
    naive4 != null ? computeEOQ(Number(naive4), orderingCost, holdingCost) : null;

  const overNaive =
    Number.isFinite(ml4) && naive4 != null
      ? Math.max(0, Number(naive4) - ml4)
      : 0;
  const underNaive =
    Number.isFinite(ml4) && naive4 != null
      ? Math.max(0, ml4 - Number(naive4))
      : 0;
  const weeklyHolding = holdingCost / 52;
  const roughExtraHolding = Math.round(overNaive * weeklyHolding * 4);
  const roughMissedProfit = Math.round(underNaive * unitMargin);

  return {
    eoq: {
      ordering_cost_per_order: orderingCost,
      holding_cost_per_unit_year: holdingCost,
      eoq_units_aligned_with_ml: eoqMl,
      eoq_units_aligned_with_naive_plan: eoqNaive,
      annualized_demand_from_ml: Number.isFinite(ml4) ? Math.round(ml4 * 13) : null,
      annualized_demand_from_naive_plan:
        naive4 != null ? Math.round(Number(naive4) * 13) : null,
    },
    illustrative_impact: {
      unit_margin_assumption_inr: unitMargin,
      disclaimer:
        'Illustrative demo: rough signals if you plan with a flat historical average vs ML-guided demand — not financial advice.',
      naive_over_forecasts_vs_ml_units: overNaive,
      naive_under_forecasts_vs_ml_units: underNaive,
      rough_extra_holding_exposure_4w_inr: roughExtraHolding,
      rough_missed_profit_if_understocked_inr: roughMissedProfit,
      net_illustrative_signal_inr: roughMissedProfit - roughExtraHolding,
    },
  };
}

// Auto PO number: PO-20240315-0001
async function generatePONumber() {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${today}-`;
  const last   = await PurchaseOrder
    .findOne({ poNumber: { $regex: `^${prefix}` } })
    .sort({ poNumber: -1 }).lean();
  const seq = last ? parseInt(last.poNumber.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// Parse CSV or Excel file → array of plain row objects
async function parseUploadedFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb    = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  // CSV fallback
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', r => rows.push(r))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

// Build flat ML data from Sale + Product join
async function buildMLSalesData(storeId) {
  const sales = await Sale.find({ storeId })
    .populate('product', 'sku holdingCost')
    .lean();
  return sales
    .filter(s => s.product?.sku)
    .map(s => ({
      date:   new Date(s.saleDate).toISOString().split('T')[0],
      sku_id: s.product.sku,
      sales:  s.quantity
    }));
}

// Auto-create PO for any product whose stock is at or below reorderPoint
async function autoCreatePOs(productIds) {
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const lowStock = products.filter(p => p.totalStock <= p.reorderPoint);
  const created  = [];

  for (const p of lowStock) {
    // Don't duplicate — skip if a Pending PO already exists for this product
    const alreadyExists = await PurchaseOrder.findOne({
      status: 'Pending',
      'items.product': p._id
    }).lean();
    if (alreadyExists) continue;

    const poNumber = await generatePONumber();
    const qty      = computeEOQ(p.totalStock || 50, 50, p.holdingCost || 2)
                     || (p.reorderPoint * 2);

    const po = await PurchaseOrder.create({
      poNumber,
      supplier:     'Auto-Generated',
      status:       'Pending',
      expectedDate: new Date(Date.now() + (p.leadTime || 2) * 86400000),
      items: [{ product: p._id, orderedQty: qty, costPerUnit: p.costPrice }]
    });

    created.push({ poNumber, product: p.name, orderedQty: qty });
    console.log(`[Auto PO] ${poNumber} → ${p.name} qty=${qty}`);
  }
  return created;
}

// Fire-and-forget ML training (runs in background, never blocks the response)
function triggerMLTraining(storeId) {
  buildMLSalesData(storeId).then(mlData => {
    if (!mlData.length) return;
    return trainModels(storeId, mlData);
  }).then(result => {
    if (!result) return;
    const trained = Object.values(result.results).filter(v => v === 'trained').length;
    console.log(`[Auto ML] store=${storeId} trained=${trained} SKUs`);
  }).catch(err => {
    console.error(`[Auto ML] failed store=${storeId}:`, err.message);
  });
}


// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
app.get('/',          (req, res) => res.send('Vector-AI Backend Running'));
app.get('/api',       (req, res) => res.json({ message: 'API is working', status: 'success' }));
app.get('/api/health',(req, res) => res.json({ status: 'ok' }));


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — INVENTORY ENTRY
//  Schema: { name, sku, quantity, price, category }
//  Supports: manual single entry OR CSV/Excel bulk upload
//  Auto: creates Batch in Product collection + triggers PO if stock low
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// List all inventory with pagination + search
// ?page=1&limit=20&search=rice&category=Grains
app.get('/api/inventory', asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const filter = {};

  if (req.query.search)   filter.name     = { $regex: req.query.search, $options: 'i' };
  if (req.query.category) filter.category = { $regex: req.query.category, $options: 'i' };

  const [items, total] = await Promise.all([
    Inventory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Inventory.countDocuments(filter)
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// ─── GET /api/inventory/:id ───────────────────────────────────────────────────
app.get('/api/inventory/:id', validateObjectId, asyncHandler(async (req, res) => {
  const item = await Inventory.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: 'Inventory item not found' });
  return res.json(item);
}));

// ─── POST /api/inventory ──────────────────────────────────────────────────────
// MANUAL single inventory entry
// Body: { name, sku, quantity, price, category }
// Auto: syncs to Product.totalStock → creates Batch → creates PO if low stock
app.post('/api/inventory', asyncHandler(async (req, res) => {
  const { name, sku, quantity, price, category } = req.body;

  if (!name || !sku)
    return res.status(400).json({ message: 'name and sku are required' });
  if (price === undefined || price === '')
    return res.status(400).json({ message: 'price is required' });

  const qty = parseNum(quantity, 0);
  const prc = parseNum(price, 0);

  // Upsert Inventory record (update quantity if SKU already exists)
  const inventory = await Inventory.findOneAndUpdate(
    { sku },
    { $set: { name, category: category || '', price: prc }, $inc: { quantity: qty } },
    { new: true, upsert: true, runValidators: true }
  );

  // ── Sync to Product (for ML + EOQ) ──
  // Find or create the matching Product record using the same SKU
  let product = await Product.findOne({ sku });
  if (!product) {
    product = await Product.create({
      name,
      sku,
      category:     category || '',
      sellingPrice: prc,
      costPrice:    prc,       // default cost = price; update manually if needed
      totalStock:   qty
    });
  } else {
    product.totalStock += qty;
    await product.save();
  }

  // ── Auto-create Batch for this stock addition ──
  let batch = null;
  if (qty > 0) {
    batch = await Batch.create({
      product:    product._id,
      initialQty: qty,
      currentQty: qty,
      expiryDate: req.body.expiryDate
        ? new Date(req.body.expiryDate)
        : new Date(Date.now() + 365 * 86400000), // default 1 year if not given
      supplier:   req.body.supplier || '',
      status:     'Active'
    });
    console.log(`[Auto Batch] sku=${sku} qty=${qty} batch=${batch._id}`);
  }

  // ── Auto-create PO if stock is at or below reorder point ──
  const autoPOs = await autoCreatePOs([product._id]);

  return res.status(201).json({
    message:   'Inventory entry saved',
    inventory,
    batch,
    auto_pos:  autoPOs
  });
}));

// ─── POST /api/inventory/upload ───────────────────────────────────────────────
// BULK inventory entry via CSV or Excel
//
// CSV/Excel columns (case-insensitive):
//   name, sku, quantity, price, category, expiryDate (optional), supplier (optional)
//
// Auto: creates Batch per row + PO for any low-stock SKU
app.post('/api/inventory/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file)
    return res.status(400).json({ message: 'File is required. Field name: file' });

  let rows = [];
  try {
    rows = await parseUploadedFile(req.file.path, req.file.originalname);
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  if (!rows.length)
    return res.status(400).json({ message: 'File is empty or could not be parsed' });

  // Normalize column names (lowercase, trimmed)
  const normalize = (obj) => {
    const out = {};
    for (const k of Object.keys(obj)) out[k.toLowerCase().trim()] = String(obj[k]).trim();
    return out;
  };

  const valid   = [];
  const invalid = [];

  for (const raw of rows) {
    const row = normalize(raw);
    if (!row.name || !row.sku) { invalid.push(row); continue; }
    valid.push(row);
  }

  if (!valid.length)
    return res.status(400).json({ message: 'No valid rows found. Ensure columns: name, sku, quantity, price' });

  const results   = { created: 0, updated: 0, batches: 0, errors: [] };
  const productIds = [];

  for (const row of valid) {
    try {
      const qty = parseNum(row.quantity, 0);
      const prc = parseNum(row.price, 0);

      // Upsert Inventory
      const inv = await Inventory.findOneAndUpdate(
        { sku: row.sku },
        {
          $set: { name: row.name, category: row.category || '', price: prc },
          $inc: { quantity: qty }
        },
        { new: true, upsert: true }
      );

      // Sync to Product
      let product = await Product.findOne({ sku: row.sku });
      if (!product) {
        product = await Product.create({
          name:         row.name,
          sku:          row.sku,
          category:     row.category || '',
          sellingPrice: prc,
          costPrice:    prc,
          totalStock:   qty
        });
        results.created++;
      } else {
        product.totalStock += qty;
        await product.save();
        results.updated++;
      }

      productIds.push(product._id);

      // Auto-create Batch per row
      if (qty > 0) {
        await Batch.create({
          product:    product._id,
          initialQty: qty,
          currentQty: qty,
          expiryDate: row.expirydate
            ? new Date(row.expirydate)
            : new Date(Date.now() + 365 * 86400000),
          supplier:   row.supplier || '',
          status:     'Active'
        });
        results.batches++;
      }
    } catch (err) {
      results.errors.push({ sku: row.sku, error: err.message });
    }
  }

  // Auto PO for any low-stock products found in this upload
  const autoPOs = await autoCreatePOs(productIds);

  return res.status(201).json({
    message:       'Inventory upload complete',
    processed:     valid.length,
    skipped:       invalid.length,
    created:       results.created,
    updated:       results.updated,
    batches_created: results.batches,
    auto_pos:      autoPOs,
    errors:        results.errors
  });
}));

// ─── PUT /api/inventory/:id ───────────────────────────────────────────────────
app.put('/api/inventory/:id', validateObjectId, asyncHandler(async (req, res) => {
  const { name, quantity, price, category } = req.body;
  const update = {};
  if (name     !== undefined) update.name     = name;
  if (price    !== undefined) update.price    = parseNum(price, 0);
  if (category !== undefined) update.category = category;
  if (quantity !== undefined) update.quantity = parseNum(quantity, 0);

  const updated = await Inventory.findByIdAndUpdate(
    req.params.id, update, { new: true, runValidators: true }
  );
  if (!updated) return res.status(404).json({ message: 'Inventory item not found' });

  // Sync totalStock to Product
  if (quantity !== undefined) {
    await Product.findOneAndUpdate(
      { sku: updated.sku },
      { totalStock: parseNum(quantity, 0) }
    );
  }

  return res.json({ message: 'Inventory updated', item: updated });
}));

// ─── DELETE /api/inventory/:id ────────────────────────────────────────────────
app.delete('/api/inventory/:id', validateObjectId, asyncHandler(async (req, res) => {
  const deleted = await Inventory.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Inventory item not found' });
  return res.json({ message: 'Inventory item deleted' });
}));


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — SALES ENTRY
//  Schema: { product (ObjectId), quantity, saleDate, storeId }
//  Supports: manual single entry OR CSV/Excel bulk upload
//  Auto: deducts stock from Inventory + Product → triggers ML training
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/sales ───────────────────────────────────────────────────────────
// List sales with pagination + filters
// ?page=1&limit=20&storeId=store_1&sku=SKU001&from=2024-01-01&to=2024-03-31
app.get('/api/sales', asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.query.storeId) filter.storeId = req.query.storeId;
  if (req.query.from || req.query.to) {
    filter.saleDate = {};
    if (req.query.from) filter.saleDate.$gte = new Date(req.query.from);
    if (req.query.to)   filter.saleDate.$lte = new Date(req.query.to);
  }

  // Filter by SKU: resolve to productId first
  if (req.query.sku) {
    const prod = await Product.findOne({ sku: req.query.sku }).lean();
    if (prod) filter.product = prod._id;
  }

  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('product', 'name sku category')
      .sort({ saleDate: -1 })
      .skip(skip).limit(limit).lean(),
    Sale.countDocuments(filter)
  ]);

  res.json({ sales, total, page, pages: Math.ceil(total / limit) });
}));

// ─── POST /api/sales ──────────────────────────────────────────────────────────
// MANUAL single sale entry
// Body: { sku OR productId, quantity, saleDate (optional), storeId (optional) }
// Auto: deducts stock from Inventory + Product → triggers ML training
app.post('/api/sales', asyncHandler(async (req, res) => {
  const { sku, productId, quantity, saleDate, storeId } = req.body;

  if (!quantity || parseNum(quantity) <= 0)
    return res.status(400).json({ message: 'quantity must be a positive number' });

  // Resolve product by sku or productId
  let product;
  if (sku) {
    product = await Product.findOne({ sku });
  } else if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    product = await Product.findById(productId);
  }

  if (!product)
    return res.status(404).json({ message: 'Product not found. Provide valid sku or productId' });

  const qty     = parseNum(quantity);
  const store   = storeId || 'store_1';
  const saleDay = saleDate ? new Date(saleDate) : new Date();

  // Create Sale record
  const sale = await Sale.create({
    product:  product._id,
    quantity: qty,
    saleDate: saleDay,
    storeId:  store
  });

  // ── Deduct stock from Inventory ──
  await Inventory.findOneAndUpdate(
    { sku: product.sku },
    { $inc: { quantity: -qty } }
  );

  // ── Deduct from Product.totalStock ──
  product.totalStock = Math.max(0, product.totalStock - qty);
  await product.save();

  // ── Deduct from Batch (FIFO — oldest expiry first) ──
  let remaining = qty;
  const batches = await Batch.find({ product: product._id, status: 'Active', currentQty: { $gt: 0 } })
    .sort({ expiryDate: 1 });

  for (const batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.currentQty, remaining);
    batch.currentQty -= deduct;
    if (batch.currentQty === 0) batch.status = 'Sold';
    await batch.save();
    remaining -= deduct;
  }

  // ── Auto-create PO if stock dropped below reorder point ──
  const autoPOs = await autoCreatePOs([product._id]);

  // ── Trigger ML training in background ──
  triggerMLTraining(store);

  return res.status(201).json({
    message:  'Sale recorded',
    sale:     await sale.populate('product', 'name sku'),
    stock_remaining: product.totalStock,
    auto_pos: autoPOs
  });
}));

// ─── POST /api/sales/upload ───────────────────────────────────────────────────
// BULK sales entry via CSV or Excel from billing system
//
// CSV/Excel columns (case-insensitive):
//   sku, quantity, saleDate (optional), storeId (optional)
//   OR: product_name instead of sku (we'll try to match by name)
//
// Auto: deducts stock → creates POs → triggers ML training
app.post('/api/sales/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file)
    return res.status(400).json({ message: 'File required. Field name: file' });

  const storeId = req.body.storeId || req.query.storeId || 'store_1';

  let rows = [];
  try {
    rows = await parseUploadedFile(req.file.path, req.file.originalname);
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  if (!rows.length)
    return res.status(400).json({ message: 'File is empty or could not be parsed' });

  // Normalize column names
  const normalize = (obj) => {
    const out = {};
    for (const k of Object.keys(obj)) out[k.toLowerCase().trim().replace(/\s+/g, '_')] = String(obj[k]).trim();
    return out;
  };

  // Pre-load all products into a map for fast lookup
  const allProducts = await Product.find({}).lean();
  const bySkuMap  = {};
  const byNameMap = {};
  for (const p of allProducts) {
    bySkuMap[p.sku.toLowerCase()]   = p;
    byNameMap[p.name.toLowerCase()] = p;
  }

  const salesDocs  = [];
  const stockMap   = {};   // productId → total qty sold (for batch deduction later)
  const productIds = [];
  const errors     = [];

  for (const raw of rows) {
    const row = normalize(raw);
    const qty = parseNum(row.quantity || row.qty, 0);
    if (qty <= 0) { errors.push({ row: raw, error: 'quantity missing or zero' }); continue; }

    // Resolve product
    const skuKey  = (row.sku || '').toLowerCase();
    const nameKey = (row.product_name || row.name || '').toLowerCase();
    const product = bySkuMap[skuKey] || byNameMap[nameKey];

    if (!product) {
      errors.push({ row: raw, error: `Product not found: sku="${row.sku}" name="${row.product_name || row.name}"` });
      continue;
    }

    const saleDate = row.saledate || row.sale_date || row.date;

    salesDocs.push({
      product:  product._id,
      quantity: qty,
      saleDate: saleDate ? new Date(saleDate) : new Date(),
      storeId:  row.storeid || row.store_id || storeId
    });

    // Accumulate stock deductions per product
    const pid = product._id.toString();
    stockMap[pid] = (stockMap[pid] || 0) + qty;
    if (!productIds.find(id => id.toString() === pid)) productIds.push(product._id);
  }

  if (!salesDocs.length)
    return res.status(400).json({ message: 'No valid sales rows found', errors });

  // Bulk insert all sale records
  await Sale.insertMany(salesDocs, { ordered: false });

  // ── Deduct stock from Inventory + Product for each product ──
  for (const [pidStr, totalQty] of Object.entries(stockMap)) {
    const prod = allProducts.find(p => p._id.toString() === pidStr);
    if (!prod) continue;

    // Deduct from Inventory
    await Inventory.findOneAndUpdate(
      { sku: prod.sku },
      { $inc: { quantity: -totalQty } }
    );

    // Deduct from Product.totalStock
    await Product.findByIdAndUpdate(pidStr, {
      $inc: { totalStock: -totalQty }
    });

    // ── FIFO Batch deduction ──
    let remaining = totalQty;
    const batches = await Batch.find({
      product: pidStr, status: 'Active', currentQty: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.currentQty, remaining);
      batch.currentQty -= deduct;
      if (batch.currentQty === 0) batch.status = 'Sold';
      await batch.save();
      remaining -= deduct;
    }
  }

  // ── Auto-create POs for any low-stock products ──
  const autoPOs = await autoCreatePOs(productIds);

  // ── Trigger ML training in background ──
  triggerMLTraining(storeId);

  return res.status(201).json({
    message:        'Sales upload complete',
    total_rows:     rows.length,
    sales_created:  salesDocs.length,
    skipped:        rows.length - salesDocs.length,
    auto_pos:       autoPOs,
    errors:         errors.slice(0, 20)  // cap error list at 20
  });
}));

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
app.get('/api/sales/:id', validateObjectId, asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id)
    .populate('product', 'name sku category sellingPrice')
    .lean();
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  return res.json(sale);
}));

// ─── DELETE /api/sales/:id ────────────────────────────────────────────────────
app.delete('/api/sales/:id', validateObjectId, asyncHandler(async (req, res) => {
  const sale = await Sale.findByIdAndDelete(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  return res.json({ message: 'Sale deleted' });
}));


// ════════════════════════════════════════════════════════════════════════════
//  PURCHASE ORDERS
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/purchase-orders ─────────────────────────────────────────────────
// ?status=Pending&page=1&limit=20
app.get('/api/purchase-orders', asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [pos, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('items.product', 'name sku')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    PurchaseOrder.countDocuments(filter)
  ]);

  res.json({ purchase_orders: pos, total, page, pages: Math.ceil(total / limit) });
}));

// ─── GET /api/purchase-orders/:id ────────────────────────────────────────────
app.get('/api/purchase-orders/:id', validateObjectId, asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id)
    .populate('items.product', 'name sku category')
    .lean();
  if (!po) return res.status(404).json({ message: 'Purchase Order not found' });
  return res.json(po);
}));

// ─── POST /api/purchase-orders ────────────────────────────────────────────────
// Manual PO creation
// Body: { supplier, expectedDate, items: [{ sku, orderedQty, costPerUnit }] }
app.post('/api/purchase-orders', asyncHandler(async (req, res) => {
  const { supplier, expectedDate, items } = req.body;

  if (!supplier)           return res.status(400).json({ message: 'supplier is required' });
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ message: 'items array is required' });

  // Resolve each item's SKU → Product ObjectId
  const resolvedItems = [];
  for (const item of items) {
    const product = await Product.findOne({ sku: item.sku }).lean();
    if (!product) {
      return res.status(404).json({ message: `Product not found for SKU: ${item.sku}` });
    }
    resolvedItems.push({
      product:     product._id,
      orderedQty:  parseNum(item.orderedQty || item.quantity, 1),
      receivedQty: 0,
      costPerUnit: parseNum(item.costPerUnit || item.cost || product.costPrice, 0)
    });
  }

  const poNumber = await generatePONumber();
  const po = await PurchaseOrder.create({
    poNumber,
    supplier,
    status:       'Pending',
    expectedDate: expectedDate ? new Date(expectedDate) : null,
    items:        resolvedItems
  });

  return res.status(201).json({ message: 'Purchase Order created', purchase_order: po });
}));

// ─── PUT /api/purchase-orders/:id/receive ─────────────────────────────────────
// Mark a PO as Received → auto-creates Batches + adds stock to Inventory + Product
// Body: { items: [{ sku, receivedQty, expiryDate }] }
app.put('/api/purchase-orders/:id/receive', validateObjectId, asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id)
    .populate('items.product');

  if (!po)                     return res.status(404).json({ message: 'Purchase Order not found' });
  if (po.status === 'Received') return res.status(400).json({ message: 'PO already received' });
  if (po.status === 'Cancelled') return res.status(400).json({ message: 'PO is cancelled' });

  const receivedItems  = req.body.items || [];  // optional per-item overrides
  const batchesCreated = [];

  for (const poItem of po.items) {
    const product = poItem.product;

    // Find override for this item if provided
    const override = receivedItems.find(
      r => r.sku === product.sku || r.productId === product._id.toString()
    );
    const receivedQty = parseNum(override?.receivedQty ?? poItem.orderedQty, 0);
    const expiryDate  = override?.expiryDate
      ? new Date(override.expiryDate)
      : new Date(Date.now() + 365 * 86400000);

    if (receivedQty <= 0) continue;

    poItem.receivedQty = receivedQty;

    // ── Auto-create Batch for received stock ──
    const batch = await Batch.create({
      product:       product._id,
      purchaseOrder: po._id,
      supplier:      po.supplier,
      initialQty:    receivedQty,
      currentQty:    receivedQty,
      expiryDate,
      status:        'Active'
    });
    batchesCreated.push({ sku: product.sku, qty: receivedQty, batch: batch._id });

    // ── Add stock to Inventory ──
    await Inventory.findOneAndUpdate(
      { sku: product.sku },
      { $inc: { quantity: receivedQty } },
      { upsert: false }
    );

    // ── Add stock to Product.totalStock ──
    await Product.findByIdAndUpdate(product._id, {
      $inc: { totalStock: receivedQty }
    });

    console.log(`[PO Receive] sku=${product.sku} qty=${receivedQty} batch=${batch._id}`);
  }

  po.status       = 'Received';
  po.receivedDate = new Date();
  await po.save();

  return res.json({
    message:         'Purchase Order received',
    purchase_order:  po,
    batches_created: batchesCreated
  });
}));

// ─── PUT /api/purchase-orders/:id/cancel ──────────────────────────────────────
app.put('/api/purchase-orders/:id/cancel', validateObjectId, asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po)                      return res.status(404).json({ message: 'Purchase Order not found' });
  if (po.status === 'Received') return res.status(400).json({ message: 'Cannot cancel a received PO' });

  po.status = 'Cancelled';
  await po.save();
  return res.json({ message: 'Purchase Order cancelled', purchase_order: po });
}));


// ════════════════════════════════════════════════════════════════════════════
//  BATCHES
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/batches ─────────────────────────────────────────────────────────
// ?sku=SKU001&status=Active&expiring=7  (expiring = days from now)
app.get('/api/batches', asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.expiring) {
    const days = parseInt(req.query.expiring) || 7;
    filter.expiryDate = { $lte: new Date(Date.now() + days * 86400000) };
    filter.status = 'Active';
  }

  // Filter by SKU
  if (req.query.sku) {
    const prod = await Product.findOne({ sku: req.query.sku }).lean();
    if (prod) filter.product = prod._id;
  }

  const [batches, total] = await Promise.all([
    Batch.find(filter)
      .populate('product', 'name sku category')
      .sort({ expiryDate: 1 })
      .skip(skip).limit(limit).lean(),
    Batch.countDocuments(filter)
  ]);

  res.json({ batches, total, page, pages: Math.ceil(total / limit) });
}));


// ════════════════════════════════════════════════════════════════════════════
//  ML ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/ml/health ───────────────────────────────────────────────────────
app.get('/api/ml/health', asyncHandler(async (req, res) => {
  const alive = await healthCheck();
  res.json({
    ml_engine: alive ? 'online' : 'offline',
    url: process.env.ML_ENGINE_URL || 'http://localhost:8000'
  });
}));

// ─── GET /api/ml/preview/:storeId ────────────────────────────────────────────
// Debug: see what data will be sent to ML engine before training
app.get('/api/ml/preview/:storeId', asyncHandler(async (req, res) => {
  const mlData = await buildMLSalesData(req.params.storeId);
  if (!mlData.length)
    return res.status(404).json({ message: `No sales data found for store "${req.params.storeId}"` });

  const skus = [...new Set(mlData.map(r => r.sku_id))];
  return res.json({
    store_id:      req.params.storeId,
    total_records: mlData.length,
    skus_found:    skus,
    sample:        mlData.slice(0, 10)
  });
}));

// ─── POST /api/ml/train/:storeId ─────────────────────────────────────────────
// Manually trigger ML training
app.post('/api/ml/train/:storeId', asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const mlData = await buildMLSalesData(storeId);

  if (!mlData.length)
    return res.status(404).json({
      message: `No sales data for store "${storeId}". Add sales first.`
    });

  console.log(`[ML Train] store=${storeId} records=${mlData.length}`);
  const result = await trainModels(storeId, mlData);

  const trained = Object.values(result.results).filter(v => v === 'trained').length;
  const skipped = Object.values(result.results).filter(v => v.startsWith('skipped')).length;
  const errors  = Object.values(result.results).filter(v => v.startsWith('error')).length;

  return res.json({
    message:  'Training complete',
    store_id: storeId,
    summary:  { trained, skipped, errors },
    details:  result.results
  });
}));

// ─── GET /api/ml/forecast/:storeId/:sku ──────────────────────────────────────
// Forecast 4 weeks + EOQ for one SKU
// ?ordering_cost=100&holding_cost=5
app.get('/api/ml/forecast/:storeId/:sku', asyncHandler(async (req, res) => {
  const { storeId, sku } = req.params;
  const orderingCost = parseFloat(req.query.ordering_cost) || 50;

  const mlData = await buildMLSalesData(storeId);
  if (!mlData.length)
    return res.status(404).json({ message: `No sales data for store "${storeId}"` });

  const product     = await Product.findOne({ sku }).lean();
  const holdingCost = product?.holdingCost || 2;

  const result = await getForecast(storeId, sku, mlData);
  const eoq    = computeEOQ(result.eoq_hint.total_4_week_demand, orderingCost, holdingCost);

  return res.json({
    store_id: storeId,
    sku_id:   sku,
    product:  product ? { name: product.name, category: product.category, stock: product.totalStock } : null,
    forecast: result.forecast,
    eoq: {
      value:         eoq,
      unit:          'units per order',
      ordering_cost: orderingCost,
      holding_cost:  holdingCost,
      annual_demand: Math.round(result.eoq_hint.total_4_week_demand * 13),
      avg_weekly:    result.eoq_hint.avg_weekly_demand
    }
  });
}));

// ─── GET /api/ml/forecast/:storeId ───────────────────────────────────────────
// Forecast ALL SKUs for a store
app.get('/api/ml/forecast/:storeId', asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const orderingCost = parseFloat(req.query.ordering_cost) || 50;

  const mlData = await buildMLSalesData(storeId);
  if (!mlData.length)
    return res.status(404).json({ message: `No sales data for store "${storeId}"` });

  const skuIds  = [...new Set(mlData.map(r => r.sku_id))];
  const products = await Product.find({ sku: { $in: skuIds } }).lean();
  const prodMap  = {};
  products.forEach(p => { prodMap[p.sku] = p; });

  const allForecasts = [];
  for (const skuId of skuIds) {
    try {
      const result      = await getForecast(storeId, skuId, mlData);
      const holdingCost = prodMap[skuId]?.holdingCost || 2;
      const eoq         = computeEOQ(result.eoq_hint.total_4_week_demand, orderingCost, holdingCost);
      allForecasts.push({
        sku_id:   skuId,
        product:  prodMap[skuId] ? { name: prodMap[skuId].name, category: prodMap[skuId].category } : null,
        forecast: result.forecast,
        eoq:      { value: eoq, avg_weekly: result.eoq_hint.avg_weekly_demand }
      });
    } catch (err) {
      allForecasts.push({ sku_id: skuId, error: err.message });
    }
  }

  return res.json({ store_id: storeId, total_skus: skuIds.length, forecasts: allForecasts });
}));


// ════════════════════════════════════════════════════════════════════════════
//  PREDICT API — Frontend → Node (this route) → Python POST /predict → MongoDB
// ════════════════════════════════════════════════════════════════════════════

/** Basic validation before calling the ML engine (avoids pointless HTTP hops). */
function validatePredictBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('Request body must be JSON');
    return errors;
  }
  if (!body.store_id || typeof body.store_id !== 'string' || !String(body.store_id).trim()) {
    errors.push('store_id is required');
  }
  if (!body.sku_id || typeof body.sku_id !== 'string' || !String(body.sku_id).trim()) {
    errors.push('sku_id is required');
  }
  if (!Array.isArray(body.data) || body.data.length === 0) {
    errors.push('data must be a non-empty array of { date, sku_id, sales }');
    return errors;
  }
  body.data.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      errors.push(`data[${i}] must be an object`);
      return;
    }
    if (!row.date) errors.push(`data[${i}].date is required`);
    if (!row.sku_id) errors.push(`data[${i}].sku_id is required`);
    const sales = Number(row.sales);
    if (!Number.isFinite(sales)) errors.push(`data[${i}].sales must be a finite number`);
  });
  return errors;
}

app.post('/api/predict', asyncHandler(async (req, res) => {
  const validationErrors = validatePredictBody(req.body);
  if (validationErrors.length) {
    console.warn('[Predict] validation failed:', validationErrors);
    return res.status(400).json({ message: 'Invalid input', errors: validationErrors });
  }

  const payload = {
    store_id: String(req.body.store_id).trim(),
    sku_id: String(req.body.sku_id).trim(),
    data: req.body.data.map((row) => ({
      date: String(row.date),
      sku_id: String(row.sku_id),
      sales: Number(row.sales),
    })),
  };

  // Align PredictionLog with Product catalog (see backend/DATABASE_SCHEMA.md)
  const productRow = await Product.findOne({ sku: payload.sku_id })
    .select('_id holdingCost')
    .lean();
  const productId = productRow?._id || null;

  try {
    const result = await predictDemand(payload);

    let orderingCost = parseNum(req.body.ordering_cost, 50);
    if (orderingCost <= 0) orderingCost = 50;
    let holdingCost = parseNum(req.body.holding_cost, NaN);
    if (!Number.isFinite(holdingCost) || holdingCost <= 0) {
      holdingCost =
        productRow?.holdingCost && productRow.holdingCost > 0 ? productRow.holdingCost : 2;
    }
    let unitMargin = parseNum(req.body.unit_margin, 15);
    if (unitMargin <= 0) unitMargin = 15;

    const insights = buildPredictInsights(result, {
      orderingCost,
      holdingCost,
      unitMargin,
    });

    const log = await PredictionLog.create({
      storeId: payload.store_id,
      sku: payload.sku_id,
      product: productId,
      status: 'success',
      inputData: {
        ...payload,
        ordering_cost: orderingCost,
        holding_cost: holdingCost,
        unit_margin: unitMargin,
      },
      prediction: { ...result, insights },
    });
    console.log(`[Predict] ok store=${payload.store_id} sku=${payload.sku_id} log=${log._id}`);
    return res.json({
      ok: true,
      logId: log._id,
      prediction: result,
      insights,
    });
  } catch (err) {
    let detail = err.message || 'Unknown error';
    let status = 500;

    // Errors from mlService.fetchJson attach response for FastAPI-style bodies
    const mlStatus = err.response?.status;
    if (mlStatus >= 400 && mlStatus < 600) {
      const d = err.response?.data?.detail;
      if (typeof d === 'string') detail = d;
      else if (d !== undefined) detail = JSON.stringify(d);
      status = mlStatus;
    } else if (err.code === 'ECONNABORTED') {
      status = 504;
    } else if (!mlStatus) {
      status = 502;
    }

    const log = await PredictionLog.create({
      storeId: payload.store_id,
      sku: payload.sku_id,
      product: productId,
      status: 'error',
      inputData: payload,
      prediction: { error: detail, httpStatus: status },
    });
    console.error(`[Predict] failed log=${log._id} status=${status} detail=${detail}`);

    return res.status(status).json({
      ok: false,
      logId: log._id,
      message: 'Prediction service error',
      detail,
    });
  }
}));


// ════════════════════════════════════════════════════════════════════════════
//  ERROR HANDLER — must always be last
// ════════════════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Validation error',          details: err.message });
  if (err.code === 11000)             return res.status(409).json({ message: 'Duplicate key error',       details: err.keyValue });
  if (err.name === 'MulterError')     return res.status(400).json({ message: 'File upload error',         details: err.message });
  if (err.name === 'CastError')       return res.status(400).json({ message: 'Invalid identifier format', details: err.message });
  return res.status(500).json({ message: 'Internal server error' });
});


// ════════════════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════════════════
const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    throw err;
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;