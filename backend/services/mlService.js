// services/mlService.js
// All communication with the Python FastAPI ML engine lives here.
// Node.js routes call these functions — never call axios directly from routes.

const axios = require("axios");
require("dotenv").config();

const ML_URL = process.env.ML_ENGINE_URL || "http://localhost:8000";

// Timeout: 5 minutes for training (can be slow for many SKUs)
const TRAIN_TIMEOUT  = 5 * 60 * 1000;
const FORECAST_TIMEOUT = 30 * 1000;


/**
 * Send sales data to ML engine and train models for all SKUs.
 *
 * @param {string} storeId
 * @param {Array}  salesData  - [{date, sku_id, sales}, ...]
 * @returns {object}          - {SKU001: "trained", SKU002: "skipped", ...}
 */
async function trainModels(storeId, salesData) {
  const response = await axios.post(
    `${ML_URL}/train/${storeId}`,
    { data: salesData },
    { timeout: TRAIN_TIMEOUT }
  );
  return response.data;  // { store_id, results }
}


/**
 * Get 4-week forecast for a single SKU.
 *
 * @param {string} storeId
 * @param {string} skuId
 * @param {Array}  salesData  - full historical data (same as training)
 * @returns {object}          - { forecast: [...], eoq_hint: {...} }
 */
async function getForecast(storeId, skuId, salesData) {
  const response = await axios.post(
    `${ML_URL}/forecast/${storeId}/${skuId}`,
    { data: salesData },
    { timeout: FORECAST_TIMEOUT }
  );
  return response.data;  // { store_id, sku_id, forecast, eoq_hint }
}


/**
 * Check if the ML engine is alive.
 * @returns {boolean}
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${ML_URL}/health`, { timeout: 5000 });
    return response.data.status === "ok";
  } catch {
    return false;
  }
}


module.exports = { trainModels, getForecast, healthCheck };