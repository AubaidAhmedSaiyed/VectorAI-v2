// routes/mlRoutes.js
// Plug these ML routes into your existing server.js with:
//   const mlRoutes = require('./routes/mlRoutes');
//   app.use('/api/ml', mlRoutes);

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Sale     = require('../models/Sale');
const { trainModels, getForecast, healthCheck } = require('../services/mlService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── EOQ helper ────────────────────────────────────────────────────────────
// Wilson EOQ formula: sqrt((2 * D * S) / H)
// D = annual demand, S = ordering cost per order, H = holding cost per unit/year
function computeEOQ(total4WeekDemand, orderingCost, holdingCost) {
  const annualDemand = total4WeekDemand * 13; // 4 weeks × 13 = 52 weeks
  if (holdingCost <= 0 || orderingCost <= 0) return null;
  return Math.round(Math.sqrt((2 * annualDemand * orderingCost) / holdingCost));
}


// ─── GET /api/ml/health ────────────────────────────────────────────────────
// Check if Python ML engine is reachable
router.get('/health', asyncHandler(async (req, res) => {
  const alive = await healthCheck();
  res.json({
    ml_engine: alive ? 'online' : 'offline',
    url: process.env.ML_ENGINE_URL || 'http://localhost:8000'
  });
}));


// ─── POST /api/ml/train/:storeId ──────────────────────────────────────────
// Pulls all sales for this store from MongoDB and sends to ML engine for training
//
// Usage: POST /api/ml/train/STORE1
//
router.post('/train/:storeId', asyncHandler(async (req, res) => {
  const { storeId } = req.params;

  // Pull all sales records for this store from MongoDB
  const sales = await Sale.find({ store_id: storeId })
    .select('date sku_id sales -_id')
    .lean();

  if (sales.length === 0) {
    return res.status(404).json({
      message: `No sales data found for store "${storeId}". Upload data first via POST /api/sales/upload`
    });
  }

  console.log(`[ML Train] store=${storeId} records=${sales.length}`);

  // Send to Python ML engine
  const result = await trainModels(storeId, sales);

  const trained  = Object.values(result.results).filter(v => v === 'trained').length;
  const skipped  = Object.values(result.results).filter(v => v.startsWith('skipped')).length;
  const errors   = Object.values(result.results).filter(v => v.startsWith('error')).length;

  console.log(`[ML Train] done trained=${trained} skipped=${skipped} errors=${errors}`);

  return res.json({
    message: 'Training complete',
    store_id: storeId,
    summary: { trained, skipped, errors },
    details: result.results
  });
}));


// ─── GET /api/ml/forecast/:storeId/:skuId ─────────────────────────────────
// Returns 4-week forecast + EOQ for one SKU
//
// Query params (optional):
//   ordering_cost  (default: 50)   — cost per purchase order in ₹
//   holding_cost   (default: 2)    — holding cost per unit per year in ₹
//
// Usage: GET /api/ml/forecast/STORE1/SKU001?ordering_cost=100&holding_cost=5
//
router.get('/forecast/:storeId/:skuId', asyncHandler(async (req, res) => {
  const { storeId, skuId } = req.params;
  const orderingCost = parseFloat(req.query.ordering_cost) || 50;
  const holdingCost  = parseFloat(req.query.holding_cost)  || 2;

  // Pull all sales for this store from MongoDB
  const sales = await Sale.find({ store_id: storeId })
    .select('date sku_id sales -_id')
    .lean();

  if (sales.length === 0) {
    return res.status(404).json({
      message: `No sales data found for store "${storeId}"`
    });
  }

  console.log(`[ML Forecast] store=${storeId} sku=${skuId}`);

  // Call ML engine for forecast
  const result = await getForecast(storeId, skuId, sales);

  // Compute EOQ using the 4-week total demand from ML engine
  const eoq = computeEOQ(
    result.eoq_hint.total_4_week_demand,
    orderingCost,
    holdingCost
  );

  return res.json({
    store_id:   storeId,
    sku_id:     skuId,
    forecast:   result.forecast,
    eoq: {
      value:          eoq,
      unit:           'units per order',
      ordering_cost:  orderingCost,
      holding_cost:   holdingCost,
      annual_demand:  Math.round(result.eoq_hint.total_4_week_demand * 13),
      avg_weekly:     result.eoq_hint.avg_weekly_demand
    }
  });
}));


// ─── GET /api/ml/forecast/:storeId ────────────────────────────────────────
// Forecast ALL SKUs for a store in one call
//
// Usage: GET /api/ml/forecast/STORE1
//
router.get('/forecast/:storeId', asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const orderingCost = parseFloat(req.query.ordering_cost) || 50;
  const holdingCost  = parseFloat(req.query.holding_cost)  || 2;

  // Get all unique SKUs for this store
  const skuIds = await Sale.distinct('sku_id', { store_id: storeId });

  if (skuIds.length === 0) {
    return res.status(404).json({ message: `No SKUs found for store "${storeId}"` });
  }

  // Pull all sales once (reused for every SKU forecast call)
  const sales = await Sale.find({ store_id: storeId })
    .select('date sku_id sales -_id')
    .lean();

  console.log(`[ML Forecast All] store=${storeId} skus=${skuIds.length}`);

  // Forecast each SKU (sequentially to not overwhelm the ML engine)
  const allForecasts = [];
  for (const skuId of skuIds) {
    try {
      const result = await getForecast(storeId, skuId, sales);
      const eoq = computeEOQ(result.eoq_hint.total_4_week_demand, orderingCost, holdingCost);
      allForecasts.push({
        sku_id:   skuId,
        forecast: result.forecast,
        eoq:      { value: eoq, avg_weekly: result.eoq_hint.avg_weekly_demand }
      });
    } catch (err) {
      console.error(`[ML Forecast] failed for sku=${skuId}:`, err.message);
      allForecasts.push({ sku_id: skuId, error: err.message });
    }
  }

  return res.json({
    store_id:  storeId,
    forecasts: allForecasts
  });
}));


// ─── POST /api/ml/sales/upload ─────────────────────────────────────────────
// Upload sales data as JSON array directly into MongoDB Sale collection
//
// Body: { store_id: "STORE1", data: [{date, sku_id, sales}, ...] }
//
router.post('/sales/upload', asyncHandler(async (req, res) => {
  const { store_id, data } = req.body;

  if (!store_id) return res.status(400).json({ message: 'store_id is required' });
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ message: 'data array is required and must not be empty' });
  }

  // Upsert each record (avoid duplicates on re-upload)
  const operations = data.map(row => ({
    updateOne: {
      filter: { store_id, sku_id: row.sku_id, date: row.date },
      update: { $set: { store_id, sku_id: row.sku_id, date: row.date, sales: Number(row.sales) || 0 } },
      upsert: true
    }
  }));

  const result = await Sale.bulkWrite(operations, { ordered: false });

  console.log(`[Sales Upload] store=${store_id} upserted=${result.upsertedCount} modified=${result.modifiedCount}`);

  return res.status(201).json({
    message:       'Sales data uploaded successfully',
    store_id,
    upsertedCount: result.upsertedCount,
    modifiedCount: result.modifiedCount,
    totalRecords:  data.length
  });
}));


module.exports = router;