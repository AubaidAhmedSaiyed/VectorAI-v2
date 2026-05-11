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
const PDFDocument = require('pdfkit');

// ─── Models ───────────────────────────────────────────────────────────────────
const Inventory     = require('./models/Inventory');
const Sale          = require('./models/Sale');
const Product       = require('./models/Product');
const Batch         = require('./models/Batch');
const PurchaseOrder = require('./models/PurchaseOrder');
const PredictionLog = require('./models/PredictionLog');
const Snapshot        = require('./models/Snapshot');
const User              = require('./models/User');
const bcrypt            = require('bcryptjs');
const { requireAuth, optionalAuth, signToken, authDisabled } = require('./middleware/auth');

// ─── ML Service ───────────────────────────────────────────────────────────────
const { trainModels, getForecast, healthCheck, predictDemand, predictAccuracy } = require('./services/mlService');

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

/** Local Monday 00:00 week bucket key YYYY-MM-DD */
function weekMondayKey(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

async function resolveDashboardChartSku(storeId, skuQuery) {
  const raw = skuQuery && String(skuQuery).trim();
  if (raw) {
    const p = await Product.findOne({ sku: raw }).select('sku').lean();
    if (p) return p.sku;
  }
  const top = await Sale.aggregate([
    { $match: { storeId } },
    { $group: { _id: '$product', u: { $sum: '$quantity' } } },
    { $sort: { u: -1 } },
    { $limit: 1 },
  ]);
  if (!top.length) return null;
  const pr = await Product.findById(top[0]._id).select('sku').lean();
  return pr?.sku || null;
}

async function weeklyRevenueForSku(storeId, sku, numWeeks) {
  const product = await Product.findOne({ sku }).lean();
  if (!product) return { product: null, rows: [] };
  const since = new Date();
  since.setDate(since.getDate() - (numWeeks + 4) * 7);
  const sales = await Sale.find({
    storeId,
    product: product._id,
    saleDate: { $gte: since },
  }).lean();
  const price = Number(product.sellingPrice) || 0;
  const map = new Map();
  for (const s of sales) {
    const k = weekMondayKey(s.saleDate);
    map.set(k, (map.get(k) || 0) + s.quantity * price);
  }
  const keys = Array.from(map.keys()).sort().slice(-numWeeks);
  return {
    product,
    rows: keys.map((k) => ({
      week: `Week of ${k}`,
      weekKey: k,
      sales: Math.round(map.get(k)),
    })),
  };
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
//  AUTH — JWT (set AUTH_DISABLED=true to skip Bearer checks for local tooling)
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { email, password, role, name } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'email and password are required' });
  const cleanEmail = String(email).trim().toLowerCase();
  if (password.length < 6)
    return res.status(400).json({ message: 'password must be at least 6 characters' });
  const userCount = await User.countDocuments();
  let r = 'staff';
  if (userCount === 0) {
    r = role === 'admin' || role === 'staff' ? role : 'staff';
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  try {
    const user = await User.create({
      name: String(name || '').trim(),
      email: cleanEmail,
      passwordHash,
      role: r,
    });
    const token = signToken(user);
    return res.status(201).json({
      success: true,
      token,
      user: { id: user._id, email: user.email, role: user.role, name: user.name },
    });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'An account with this email already exists' });
    throw err;
  }
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'email and password are required' });
  const cleanEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const token = signToken(user);
  return res.json({
    token,
    user: { id: user._id, email: user.email, role: user.role, name: user.name },
  });
}));

app.get('/api/auth/me', optionalAuth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  const user = await User.findById(req.user.sub).lean();
  if (!user) return res.status(401).json({ message: 'User no longer exists' });
  return res.json({
    id: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
}));


// ════════════════════════════════════════════════════════════════════════════
//  PRODUCTS — catalog (ML / EOQ source of truth for SKU metadata)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/products?page=1&limit=20&search=&category=&sku=&lowStock=1
app.get('/api/products', asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;
  const filter = {};

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { sku: { $regex: req.query.search, $options: 'i' } },
    ];
  }
  if (req.query.category) filter.category = { $regex: req.query.category, $options: 'i' };
  if (req.query.sku) filter.sku = String(req.query.sku).trim();
  if (req.query.lowStock === '1' || req.query.lowStock === 'true') {
    filter.$expr = { $lte: ['$totalStock', { $ifNull: ['$reorderPoint', 10] }] };
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ products, total, page, pages: Math.ceil(total / limit) });
}));

app.get('/api/products/:id', validateObjectId, asyncHandler(async (req, res) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) return res.status(404).json({ message: 'Product not found' });
  return res.json(p);
}));

app.post('/api/products', requireAuth, asyncHandler(async (req, res) => {
  const {
    name, sku, category, brand,
    sellingPrice, costPrice, holdingCost,
    reorderPoint, safetyStock, leadTime, totalStock,
    syncInventory,
  } = req.body;

  if (!name || !sku)
    return res.status(400).json({ message: 'name and sku are required' });
  if (sellingPrice === undefined || costPrice === undefined)
    return res.status(400).json({ message: 'sellingPrice and costPrice are required' });

  const ts = parseNum(totalStock, 0);
  const product = await Product.create({
    name: String(name).trim(),
    sku: String(sku).trim(),
    category: category || '',
    brand: brand || '',
    sellingPrice: parseNum(sellingPrice, 0),
    costPrice: parseNum(costPrice, 0),
    holdingCost: holdingCost !== undefined ? parseNum(holdingCost, 0.1) : 0.1,
    reorderPoint: reorderPoint !== undefined ? parseNum(reorderPoint, 10) : 10,
    safetyStock: safetyStock !== undefined ? parseNum(safetyStock, 5) : 5,
    leadTime: leadTime !== undefined ? parseNum(leadTime, 2) : 2,
    totalStock: ts,
  });

  const shouldSync = syncInventory !== false && ts >= 0;
  if (shouldSync) {
    await Inventory.findOneAndUpdate(
      { sku: product.sku },
      {
        $set: {
          name: product.name,
          category: product.category || '',
          price: product.sellingPrice,
          quantity: ts,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return res.status(201).json({ message: 'Product created', product });
}));

app.put('/api/products/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
  const allowed = [
    'name', 'sku', 'category', 'brand',
    'sellingPrice', 'costPrice', 'holdingCost',
    'reorderPoint', 'safetyStock', 'leadTime', 'totalStock',
  ];
  const update = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === 'sku' || k === 'name' || k === 'category' || k === 'brand') {
        update[k] = k === 'sku' || k === 'name' ? String(req.body[k]).trim() : req.body[k];
      } else {
        update[k] = parseNum(req.body[k], 0);
      }
    }
  }

  const prev = await Product.findById(req.params.id);
  if (!prev) return res.status(404).json({ message: 'Product not found' });

  if (update.sku && update.sku !== prev.sku) {
    const clash = await Product.findOne({ sku: update.sku, _id: { $ne: prev._id } }).lean();
    if (clash) return res.status(409).json({ message: 'SKU already in use' });
  }

  const product = await Product.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  if (req.body.syncInventory !== false) {
    await Inventory.findOneAndUpdate(
      { sku: prev.sku },
      { $set: { sku: product.sku, name: product.name, category: product.category, price: product.sellingPrice } }
    );
    if (req.body.totalStock !== undefined) {
      await Inventory.findOneAndUpdate(
        { sku: product.sku },
        { $set: { quantity: product.totalStock } }
      );
    }
  }

  return res.json({ message: 'Product updated', product });
}));

app.delete('/api/products/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
  const saleCount = await Sale.countDocuments({ product: req.params.id });
  if (saleCount > 0) {
    return res.status(409).json({
      message: 'Cannot delete product with existing sales records',
      salesCount: saleCount,
    });
  }
  const p = await Product.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ message: 'Product not found' });
  await Inventory.deleteMany({ sku: p.sku });
  return res.json({ message: 'Product deleted', sku: p.sku });
}));


// ════════════════════════════════════════════════════════════════════════════
//  SNAPSHOTS — periodic stock / estimate snapshots
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/snapshots', asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;
  const filter = {};
  if (req.query.from) filter.date = { ...filter.date, $gte: new Date(req.query.from) };
  if (req.query.to) filter.date = { ...filter.date, $lte: new Date(req.query.to) };
  if (req.query.sku) {
    const prod = await Product.findOne({ sku: req.query.sku }).lean();
    if (prod) filter.product = prod._id;
    else filter.product = { $in: [] };
  }

  const [snapshots, total] = await Promise.all([
    Snapshot.find(filter)
      .populate('product', 'name sku')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Snapshot.countDocuments(filter),
  ]);
  res.json({ snapshots, total, page, pages: Math.ceil(total / limit) });
}));

app.get('/api/snapshots/:id', validateObjectId, asyncHandler(async (req, res) => {
  const s = await Snapshot.findById(req.params.id).populate('product', 'name sku category').lean();
  if (!s) return res.status(404).json({ message: 'Snapshot not found' });
  return res.json(s);
}));

app.post('/api/snapshots', requireAuth, asyncHandler(async (req, res) => {
  const { productId, sku, date, closingStock, estimatedSales } = req.body;
  let product;
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    product = await Product.findById(productId);
  } else if (sku) {
    product = await Product.findOne({ sku: String(sku).trim() });
  }
  if (!product) return res.status(404).json({ message: 'Product not found (productId or sku)' });
  if (closingStock === undefined)
    return res.status(400).json({ message: 'closingStock is required' });

  const snap = await Snapshot.create({
    product: product._id,
    date: date ? new Date(date) : new Date(),
    closingStock: parseNum(closingStock, 0),
    estimatedSales: estimatedSales !== undefined ? parseNum(estimatedSales, 0) : 0,
  });
  return res.status(201).json({ message: 'Snapshot created', snapshot: snap });
}));

app.delete('/api/snapshots/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
  const s = await Snapshot.findByIdAndDelete(req.params.id);
  if (!s) return res.status(404).json({ message: 'Snapshot not found' });
  return res.json({ message: 'Snapshot deleted' });
}));


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — INVENTORY ENTRY
//  Schema: { name, sku, quantity, price, category }
//  Supports: manual single entry OR CSV/Excel bulk upload
//  Auto: creates Batch in Product collection + triggers PO if stock low
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// List all inventory with pagination + search
// ?page=1&limit=20&search=rice&category=Grains&minPrice=10&maxPrice=500
app.get('/api/inventory', asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const filter = {};

  if (req.query.search)   filter.name     = { $regex: req.query.search, $options: 'i' };
  if (req.query.category) filter.category = { $regex: req.query.category, $options: 'i' };

  const minP = parseNum(req.query.minPrice, NaN);
  if (Number.isFinite(minP)) filter.price = { ...filter.price, $gte: minP };
  const maxP = parseNum(req.query.maxPrice, NaN);
  if (Number.isFinite(maxP)) filter.price = { ...filter.price, $lte: maxP };

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
app.post('/api/inventory', requireAuth, asyncHandler(async (req, res) => {
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
app.post('/api/inventory/upload', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
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
app.put('/api/inventory/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
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
app.delete('/api/inventory/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
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
app.post('/api/sales', requireAuth, asyncHandler(async (req, res) => {
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
app.post('/api/sales/upload', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
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

// ─── PUT /api/sales/:id ───────────────────────────────────────────────────────
// Update saleDate, storeId, and/or quantity (adjusts Product + Inventory by delta; batches unchanged)
app.put('/api/sales/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('product');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });

  const { quantity, saleDate, storeId } = req.body;

  if (quantity !== undefined) {
    const newQty = parseNum(quantity, NaN);
    if (!Number.isFinite(newQty) || newQty <= 0) {
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }
    const delta = newQty - sale.quantity;
    if (delta !== 0) {
      const product = sale.product;
      if (!product) return res.status(400).json({ message: 'Sale has no linked product' });
      product.totalStock = Math.max(0, product.totalStock - delta);
      await product.save();
      await Inventory.findOneAndUpdate(
        { sku: product.sku },
        { $inc: { quantity: -delta } }
      );
      sale.quantity = newQty;
    }
  }
  if (saleDate !== undefined) sale.saleDate = new Date(saleDate);
  if (storeId !== undefined) sale.storeId = String(storeId).trim() || sale.storeId;

  await sale.save();
  triggerMLTraining(sale.storeId);

  const populated = await Sale.findById(sale._id).populate('product', 'name sku').lean();
  return res.json({ message: 'Sale updated', sale: populated });
}));

// ─── DELETE /api/sales/:id ────────────────────────────────────────────────────
app.delete('/api/sales/:id', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('product');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });

  const product = sale.product;
  if (product) {
    product.totalStock = (product.totalStock || 0) + sale.quantity;
    await product.save();
    await Inventory.findOneAndUpdate(
      { sku: product.sku },
      { $inc: { quantity: sale.quantity } }
    );
  }

  await Sale.deleteOne({ _id: sale._id });
  return res.json({ message: 'Sale deleted; stock restored to catalog' });
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
app.post('/api/purchase-orders', requireAuth, asyncHandler(async (req, res) => {
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
app.put('/api/purchase-orders/:id/receive', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
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
app.put('/api/purchase-orders/:id/cancel', requireAuth, validateObjectId, asyncHandler(async (req, res) => {
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
app.post('/api/ml/train/:storeId', requireAuth, asyncHandler(async (req, res) => {
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

/**
 * Collapse multiple Sale lines on the same calendar day into one row (sum qty).
 * Field name stays `sales` for the Python engine; values are historical sold units
 * used as demand signals, not the forecast target itself.
 */
function aggregateDailyDemandSignals(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = `${r.date}\u0000${r.sku_id}`;
    m.set(key, (m.get(key) || 0) + Number(r.sales));
  }
  return Array.from(m.entries())
    .map(([k, sales]) => {
      const [date, sku_id] = k.split('\u0000');
      return { date, sku_id, sales };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── GET /api/predict/history/:storeId?sku=... ─────────────────────────────
// Pull Sale + Product data from Mongo (same source as CSV / manual sales entry).
app.get('/api/predict/history/:storeId', asyncHandler(async (req, res) => {
  const sku = String(req.query.sku || '').trim();
  if (!sku) {
    return res.status(400).json({ message: 'Query parameter sku is required (Product.sku)' });
  }
  const storeId = String(req.params.storeId || '').trim();
  if (!storeId) {
    return res.status(400).json({ message: 'storeId is required' });
  }

  const all = await buildMLSalesData(storeId);
  const filtered = all.filter((r) => r.sku_id === sku);
  if (!filtered.length) {
    return res.status(404).json({
      message: `No sales in MongoDB for store "${storeId}" and SKU "${sku}". Record sales via the app, POST /api/sales, or inventory/sales upload.`,
    });
  }

  const data = aggregateDailyDemandSignals(filtered);
  console.log(`[Predict history] store=${storeId} sku=${sku} sale_lines=${filtered.length} days=${data.length}`);

  return res.json({
    store_id: storeId,
    sku_id: sku,
    sale_line_count: filtered.length,
    distinct_days: data.length,
    note:
      'Historical quantities sold (from your DB). The model uses them as signals to forecast future demand — not to reproduce past sales.',
    data,
  });
}));

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

/**
 * Hold-out backtest: same shape as POST /api/predict + optional holdout_weeks (1–12, default 4).
 * Compares forecast demand to actual demand in the hidden weeks (MAE, RMSE, MAPE %).
 */
app.post('/api/predict/accuracy', requireAuth, asyncHandler(async (req, res) => {
  const validationErrors = validatePredictBody(req.body);
  if (validationErrors.length) {
    return res.status(400).json({ message: 'Invalid input', errors: validationErrors });
  }

  let holdout = parseInt(req.body.holdout_weeks, 10);
  if (!Number.isFinite(holdout) || holdout < 1) holdout = 4;
  holdout = Math.min(12, holdout);

  const payload = {
    store_id: String(req.body.store_id).trim(),
    sku_id: String(req.body.sku_id).trim(),
    holdout_weeks: holdout,
    data: req.body.data.map((row) => ({
      date: String(row.date),
      sku_id: String(row.sku_id),
      sales: Number(row.sales),
    })),
  };

  try {
    const result = await predictAccuracy(payload);
    console.log(
      `[Predict accuracy] store=${payload.store_id} sku=${payload.sku_id} holdout=${holdout} mape=${result?.metrics?.mape_percent}`
    );
    return res.json(result);
  } catch (err) {
    const mlStatus = err.response?.status;
    let detail = err.message || 'Unknown error';
    if (mlStatus >= 400 && mlStatus < 600) {
      const d = err.response?.data?.detail;
      detail = typeof d === 'string' ? d : JSON.stringify(d);
    }
    const status =
      mlStatus >= 400 && mlStatus < 600
        ? mlStatus
        : err.code === 'ECONNABORTED'
          ? 504
          : 502;
    return res.status(status).json({ message: 'Accuracy check failed', detail });
  }
}));

app.post('/api/predict', requireAuth, asyncHandler(async (req, res) => {
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
//  DASHBOARD API — Real-time metrics for admin dashboard
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/dashboard/summary ──────────────────────────────────────────────
// Today's revenue, low stock count, pending orders
app.get('/api/dashboard/summary', asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';

  // Today's revenue from sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySales = await Sale.find({
    storeId,
    saleDate: { $gte: today, $lt: tomorrow }
  }).populate('product', 'sellingPrice').lean();

  const todayRevenue = todaySales.reduce((sum, sale) => {
    return sum + (sale.quantity * (sale.product?.sellingPrice || 0));
  }, 0);

  // Low stock items (below reorder point or default 10)
  const lowStockProducts = await Product.find({
    $or: [
      { totalStock: { $lte: 10 } },
      { $and: [{ reorderPoint: { $exists: true } }, { $expr: { $lte: ['$totalStock', '$reorderPoint'] } }] }
    ]
  }).lean();

  // Pending purchase orders
  const pendingOrders = await PurchaseOrder.countDocuments({ status: 'Pending' });

  // Yesterday's revenue for growth calculation
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayEnd = new Date(today);

  const yesterdaySales = await Sale.find({
    storeId,
    saleDate: { $gte: yesterday, $lt: today }
  }).populate('product', 'sellingPrice').lean();

  const yesterdayRevenue = yesterdaySales.reduce((sum, sale) => {
    return sum + (sale.quantity * (sale.product?.sellingPrice || 0));
  }, 0);

  const growthPercent = yesterdayRevenue > 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(1)
    : 0;

  res.json({
    todayRevenue: Math.round(todayRevenue),
    revenueGrowth: parseFloat(growthPercent),
    lowStockCount: lowStockProducts.length,
    pendingOrders
  });
}));

// ─── GET /api/dashboard/analytics ─────────────────────────────────────────────
// Stock data for analytics chart (recent sales performance)
app.get('/api/dashboard/analytics', asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';
  const days = parseInt(req.query.days) || 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const sales = await Sale.find({
    storeId,
    saleDate: { $gte: startDate }
  }).populate('product', 'name sellingPrice costPrice').lean();

  // Group by product for analytics
  const productMap = new Map();

  sales.forEach(sale => {
    const product = sale.product;
    if (!product) return;

    const key = product._id.toString();
    if (!productMap.has(key)) {
      productMap.set(key, {
        name: product.name,
        sku: product.sku || '',
        quantity: 0,
        soldToday: 0,
        price: product.sellingPrice || 0,
        cost: product.costPrice || product.sellingPrice || 0
      });
    }

    const item = productMap.get(key);
    item.quantity += sale.quantity;
  });

  const inventoryItems = await Inventory.find({}).lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySales = await Sale.find({
    storeId,
    saleDate: { $gte: today, $lt: tomorrow }
  }).populate('product', 'name sku').lean();

  const todaySalesMap = new Map();
  todaySales.forEach(sale => {
    const sku = sale.product?.sku;
    if (sku) {
      todaySalesMap.set(sku, (todaySalesMap.get(sku) || 0) + sale.quantity);
    }
  });

  const analyticsData = Array.from(productMap.values()).map(item => {
    const inventoryItem = item.sku
      ? inventoryItems.find(inv => inv.sku === item.sku)
      : null;
    const currentStock = inventoryItem ? inventoryItem.quantity : 0;

    return {
      name: item.name,
      sku: item.sku,
      quantity: currentStock,
      soldToday: todaySalesMap.get(item.sku) || 0,
      soldPeriod: item.quantity,
      price: item.price,
      cost: item.cost
    };
  });

  res.json(analyticsData);
}));

// ─── GET /api/dashboard/suggestions ───────────────────────────────────────────
// AI-powered suggestions based on inventory and predictions
app.get('/api/dashboard/suggestions', asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';

  // Get products with low stock
  const lowStockProducts = await Product.find({
    $or: [
      { totalStock: { $lte: 10 } },
      { $and: [{ reorderPoint: { $exists: true } }, { $expr: { $lte: ['$totalStock', '$reorderPoint'] } }] }
    ]
  }).lean();

  // Get expiring batches (next 7 days)
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000);
  const expiringBatches = await Batch.find({
    expiryDate: { $lte: sevenDaysFromNow },
    status: 'Active',
    currentQty: { $gt: 0 }
  }).populate('product', 'name').lean();

  const suggestions = [];

  // Low stock suggestions
  lowStockProducts.slice(0, 3).forEach(product => {
    suggestions.push({
      title: product.name,
      text: `Stock level is ${product.totalStock} units. Consider reordering.`,
      type: 'low_stock'
    });
  });

  // Expiring stock suggestions
  expiringBatches.slice(0, 2).forEach(batch => {
    const daysUntilExpiry = Math.ceil((batch.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    suggestions.push({
      title: batch.product?.name || 'Unknown Product',
      text: `${batch.currentQty} units expiring in ${daysUntilExpiry} days. Consider discount or promotion.`,
      type: 'expiring'
    });
  });

  // If no specific issues, add general suggestions
  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Inventory Health',
      text: 'All products are well-stocked. Consider reviewing reorder points.',
      type: 'general'
    });
  }

  res.json(suggestions);
}));

// ─── GET /api/dashboard/revenue-trend ────────────────────────────────────────
// Store-wide weekly revenue + profit from Sale lines (no random data)
// ?storeId=store_1&weeks=8
app.get('/api/dashboard/revenue-trend', asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';
  const weeks = Math.min(52, Math.max(4, parseInt(req.query.weeks, 10) || 8));
  const since = new Date();
  since.setDate(since.getDate() - (weeks + 4) * 7);

  const sales = await Sale.find({ storeId, saleDate: { $gte: since } })
    .populate('product', 'sellingPrice costPrice')
    .lean();

  const mapRev = new Map();
  const mapProfit = new Map();
  for (const s of sales) {
    const k = weekMondayKey(s.saleDate);
    const p = s.product;
    const sp = Number(p?.sellingPrice) || 0;
    const cp = Number(p?.costPrice) || 0;
    mapRev.set(k, (mapRev.get(k) || 0) + s.quantity * sp);
    mapProfit.set(k, (mapProfit.get(k) || 0) + s.quantity * (sp - cp));
  }
  const keys = Array.from(mapRev.keys()).sort().slice(-weeks);
  res.json({
    labels: keys.map((k) => `Week of ${k}`),
    revenue: keys.map((k) => Math.round(mapRev.get(k))),
    profit: keys.map((k) => Math.round(mapProfit.get(k) || 0)),
  });
}));

// ─── GET /api/dashboard/sales-chart ───────────────────────────────────────────
// Historical weekly revenue (₹) for lead SKU from DB + optional ML forecast (₹)
// ?storeId=store_1&sku=SKU001&histWeeks=8
app.get('/api/dashboard/sales-chart', asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';
  const histWeeks = Math.min(24, Math.max(4, parseInt(req.query.histWeeks, 10) || 8));

  const sku = await resolveDashboardChartSku(storeId, req.query.sku);
  if (!sku) {
    return res.json({
      points: [],
      sku: null,
      message: 'No sales in database yet. Run backend seed or record sales.',
    });
  }

  const { product, rows: histRows } = await weeklyRevenueForSku(storeId, sku, histWeeks);
  const points = histRows.map((r) => ({
    week: r.week,
    weekKey: r.weekKey,
    sales: r.sales,
    predicted: null,
  }));

  const mlData = await buildMLSalesData(storeId);
  let forecastMeta = { source: 'none', detail: '' };

  if (mlData.length && product && (await healthCheck())) {
    try {
      const result = await getForecast(storeId, sku, mlData);
      const price = Number(product.sellingPrice) || 0;
      for (const pt of result.forecast || []) {
        const wk = pt.week_start != null ? String(pt.week_start).slice(0, 10) : '';
        points.push({
          week: wk ? `Forecast ${wk}` : 'Forecast',
          weekKey: wk,
          sales: null,
          predicted: Math.round((Number(pt.forecast) || 0) * price),
        });
      }
      forecastMeta = {
        source: 'ml',
        avg_weekly_units: result.eoq_hint?.avg_weekly_demand,
      };
    } catch (err) {
      forecastMeta = {
        source: 'forecast_unavailable',
        detail: err.message || 'Train models (POST /api/ml/train) with ML engine running.',
      };
    }
  } else if (!mlData.length) {
    forecastMeta = { source: 'no_sales', detail: 'No sales rows for this store.' };
  } else {
    forecastMeta = {
      source: 'ml_offline',
      detail: 'ML engine not reachable — historical chart only.',
    };
  }

  return res.json({
    points,
    sku,
    productName: product?.name || null,
    forecastMeta,
  });
}));

// ─── GET /api/dashboard/report.pdf ───────────────────────────────────────────
// PDF summary for admins (requires JWT unless AUTH_DISABLED)
app.get('/api/dashboard/report.pdf', requireAuth, asyncHandler(async (req, res) => {
  const storeId = req.query.storeId || 'store_1';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todaySales = await Sale.find({
    storeId,
    saleDate: { $gte: today, $lt: tomorrow },
  })
    .populate('product', 'sellingPrice name sku')
    .lean();
  const todayRevenue = todaySales.reduce(
    (sum, s) => sum + s.quantity * (Number(s.product?.sellingPrice) || 0),
    0
  );

  const yesterdaySales = await Sale.find({
    storeId,
    saleDate: { $gte: yesterday, $lt: today },
  })
    .populate('product', 'sellingPrice')
    .lean();
  const yesterdayRevenue = yesterdaySales.reduce(
    (sum, s) => sum + s.quantity * (Number(s.product?.sellingPrice) || 0),
    0
  );

  const lowStockProducts = await Product.find({
    $or: [
      { totalStock: { $lte: 10 } },
      { $and: [{ reorderPoint: { $exists: true } }, { $expr: { $lte: ['$totalStock', '$reorderPoint'] } }] },
    ],
  })
    .select('name sku totalStock reorderPoint')
    .limit(15)
    .lean();

  const pendingOrders = await PurchaseOrder.countDocuments({ status: 'Pending' });

  const start30 = new Date();
  start30.setDate(start30.getDate() - 30);
  const recent = await Sale.find({ storeId, saleDate: { $gte: start30 } })
    .populate('product', 'name sku sellingPrice')
    .lean();
  const bySku = new Map();
  for (const s of recent) {
    const sku = s.product?.sku || '?';
    const name = s.product?.name || sku;
    const line = s.quantity * (Number(s.product?.sellingPrice) || 0);
    const cur = bySku.get(sku) || { name, revenue: 0, units: 0 };
    cur.revenue += line;
    cur.units += s.quantity;
    bySku.set(sku, cur);
  }
  const topLines = Array.from(bySku.entries())
    .map(([sku, v]) => ({ sku, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="vectorai-report-${storeId}-${today.toISOString().slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(18).text('VectorAI — Dashboard report', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#444').text(`Store: ${storeId}`);
  doc.text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown();
  doc.fillColor('#000');

  doc.fontSize(12).text('Summary', { underline: true });
  doc.fontSize(11);
  doc.text(`Today's revenue (approx): INR ${Math.round(todayRevenue).toLocaleString('en-IN')}`);
  doc.text(`Yesterday's revenue (approx): INR ${Math.round(yesterdayRevenue).toLocaleString('en-IN')}`);
  doc.text(`Pending purchase orders: ${pendingOrders}`);
  doc.text(`Low-stock SKUs (catalog): ${lowStockProducts.length}`);
  doc.moveDown();

  doc.fontSize(12).text('Low stock (sample)', { underline: true });
  doc.fontSize(10);
  if (!lowStockProducts.length) doc.text('None flagged.');
  else {
    lowStockProducts.forEach((p) => {
      doc.text(
        `• ${p.name} (${p.sku}) — stock ${p.totalStock}, reorder at ${p.reorderPoint ?? '—'}`
      );
    });
  }
  doc.moveDown();

  doc.fontSize(12).text('Top SKUs by revenue (last 30 days)', { underline: true });
  doc.fontSize(10);
  if (!topLines.length) doc.text('No sales in the last 30 days.');
  else {
    topLines.forEach((row, i) => {
      doc.text(
        `${i + 1}. ${row.name} (${row.sku}) — INR ${Math.round(row.revenue).toLocaleString('en-IN')} (${row.units} units)`
      );
    });
  }

  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#666').text('Figures are derived from MongoDB sales and product prices. Not financial advice.');
  doc.end();
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
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (authDisabled) {
      console.log('[Auth] AUTH_DISABLED=true — POST/PUT/DELETE do not require JWT');
    } else {
      console.log('[Auth] Mutations require Authorization: Bearer <JWT> (POST /api/auth/login)');
    }
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;