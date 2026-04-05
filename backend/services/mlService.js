// services/mlService.js
// All communication with the Python FastAPI ML engine lives here.
// Uses native fetch (Node 18+) — no axios.

require("dotenv").config();

const ML_URL = process.env.ML_ENGINE_URL || "http://localhost:8000";

const TRAIN_TIMEOUT = 5 * 60 * 1000;
const FORECAST_TIMEOUT = 30 * 1000;
const PREDICT_TIMEOUT = 30 * 1000;
const HEALTH_TIMEOUT = 5000;

/**
 * POST/GET JSON with timeout. On non-2xx, throws Error with err.response = { status, data }.
 * On timeout, throws Error with err.code === 'ECONNABORTED'.
 */
async function fetchJson(url, { method = "GET", body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!res.ok) {
      const err = new Error(
        typeof data.detail === "string"
          ? data.detail
          : `ML engine returned ${res.status}`
      );
      err.response = { status: res.status, data };
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      const t = new Error("Request timed out");
      t.code = "ECONNABORTED";
      throw t;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function trainModels(storeId, salesData) {
  return fetchJson(`${ML_URL}/train/${encodeURIComponent(storeId)}`, {
    method: "POST",
    body: { data: salesData },
    timeoutMs: TRAIN_TIMEOUT,
  });
}

async function getForecast(storeId, skuId, salesData) {
  return fetchJson(
    `${ML_URL}/forecast/${encodeURIComponent(storeId)}/${encodeURIComponent(skuId)}`,
    {
      method: "POST",
      body: { data: salesData },
      timeoutMs: FORECAST_TIMEOUT,
    }
  );
}

async function healthCheck() {
  try {
    const data = await fetchJson(`${ML_URL}/health`, {
      method: "GET",
      timeoutMs: HEALTH_TIMEOUT,
    });
    return data.status === "ok";
  } catch {
    return false;
  }
}

async function predictDemand(payload) {
  return fetchJson(`${ML_URL}/predict`, {
    method: "POST",
    body: payload,
    timeoutMs: PREDICT_TIMEOUT,
  });
}

module.exports = { trainModels, getForecast, healthCheck, predictDemand };
