const mongoose = require('mongoose');

/**
 * Audit trail for POST /api/predict — aligned with Sale.storeId + Product.sku patterns.
 *
 * Collection: predictionlogs
 * - Indexed fields support admin queries by store, SKU, product, time, outcome.
 * - inputData / prediction remain Mixed for full JSON snapshots (API payload + engine output).
 */
const PredictionLogSchema = new mongoose.Schema(
  {
    /** Same convention as Sale.storeId (e.g. store_1) */
    storeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Same convention as Product.sku / ML payload sku_id */
    sku: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Set when a Product exists with this sku — links log to catalog schema */
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['success', 'error'],
      required: true,
      index: true,
    },
    /** Full request snapshot: data[], costs, etc. */
    inputData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    /** Engine JSON + merged insights on success; { error, httpStatus } on failure */
    prediction: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { collection: 'predictionlogs' }
);

PredictionLogSchema.index({ storeId: 1, sku: 1, timestamp: -1 });

module.exports = mongoose.model('PredictionLog', PredictionLogSchema);
