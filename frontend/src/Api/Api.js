// src/api/api.js

// 🔹 BASE CONFIG (future backend)
const BASE_URL = "http://localhost:5000/api"; // future use

/**
 * In dev, default to same-origin "" so requests hit Vite's /api proxy (→ Express :5000).
 * Set VITE_API_URL in .env when the API is on another host (production).
 */
function apiOrigin() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).replace(/\/$/, "");
  if (import.meta.env.DEV) return "";
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:5000";
}

function apiUrl(path) {
  const root = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return root ? `${root}${p}` : p;
}

/** Bearer token when logged in (add Content-Type for JSON bodies yourself). */
export function authHeaders(extra = {}) {
  const headers = { ...extra };
  try {
    const token = localStorage.getItem("token");
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* non-browser */
  }
  return headers;
}

export function jsonAuthHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

/** Dashboard PDF (GET /api/dashboard/report.pdf) — requires JWT unless AUTH_DISABLED on server. */
export async function downloadDashboardReportPdf(storeId = "store_1") {
  const url = apiUrl(
    `/api/dashboard/report.pdf?storeId=${encodeURIComponent(storeId)}`
  );
  const res = await fetch(url, { method: "GET", headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      throw new Error(j.message || text || `PDF failed (${res.status})`);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(text?.slice(0, 200) || `PDF failed (${res.status}). Log in first.`);
      }
      throw e;
    }
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `vectorai-report-${storeId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * Demand prediction: Node → Python → MongoDB log (+ optional EOQ / demo economics).
 * @param {{ store_id: string, sku_id: string, data: Array<{date: string, sku_id: string, sales: number}>, ordering_cost?: number, holding_cost?: number, unit_margin?: number }} body
 */
export const submitPrediction = async (body) => {
  let res;
  try {
    res = await fetch(apiUrl("/api/predict"), {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(body),
    });
  } catch (e) {
    const base =
      import.meta.env.DEV
        ? "Is the backend running? From project root: cd backend && npm start (port 5000). MongoDB must be up (MONGO_URI in backend/.env)."
        : "Set VITE_API_URL to your API base URL and ensure the server is reachable.";
    throw new Error(
      `Could not reach API (${e?.name || "NetworkError"}: ${e?.message || "fetch failed"}). ${base}`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (import.meta.env.DEV && [502, 503, 504].includes(res.status)) {
      throw new Error(
        `API not reachable (HTTP ${res.status}). Run the backend: cd backend && npm start — port 5000. Check MONGO_URI and that MongoDB is running.`
      );
    }
    const msg =
      data.detail ||
      data.message ||
      (Array.isArray(data.errors) ? data.errors.join("; ") : res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data;
};

/**
 * Hold-out backtest: hide last N weeks, forecast from prior data, return MAE / RMSE / MAPE (%).
 * Body same as submitPrediction plus optional holdout_weeks (1–12, default 4).
 */
export const checkPredictionAccuracy = async (body) => {
  let res;
  try {
    res = await fetch(apiUrl("/api/predict/accuracy"), {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `${e?.message || "fetch failed"} ${import.meta.env.DEV ? "Is the backend running?" : ""}`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detail || data.message || res.statusText;
    throw new Error(
      typeof msg === "string" ? msg : JSON.stringify(msg) || `Request failed (${res.status})`
    );
  }
  return data;
};

/**
 * Load historical sold quantities from MongoDB (Sale + Product) for the given store/SKU.
 * Same records as manual/CSV sales entry — used as input signals for demand forecasting.
 */
export const fetchDemandHistoryFromDb = async (storeId, sku) => {
  const q = new URLSearchParams({ sku: String(sku).trim() });
  let res;
  try {
    res = await fetch(
      apiUrl(`/api/predict/history/${encodeURIComponent(String(storeId).trim())}?${q}`),
      { method: "GET" }
    );
  } catch (e) {
    const base =
      import.meta.env.DEV
        ? "Is the backend running (cd backend && npm start)?"
        : "Check VITE_API_URL and network.";
    throw new Error(`${e?.message || "fetch failed"} ${base}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || res.statusText || `Request failed (${res.status})`);
  }
  return data;
};

/* ================= AUTH ================= */

export const loginUser = async (email, password) => {
  let res;
  try {
    res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    throw new Error(
      `${e?.message || "Network error"} — start the backend (cd backend && npm start) and ensure MongoDB is running.`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Invalid credentials");
  }
  return {
    role: data.user.role,
    token: data.token,
    user: data.user,
  };
};

export const registerUser = async (email, password, role, name = "") => {
  let res;
  try {
    res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role, name }),
    });
  } catch (error) {
    console.error(error);
    throw new Error("Could not reach registration service");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Registration failed");
  }
  return data;
};


/* ================= STOCK ================= */

// Get stock list
export const getStock = async () => {
  return [
    {
      name: "Milk",
      quantity: 20,
      price: 30,
      cost: 25,
      expiry: "2026-01-10",
    },
    {
      name: "Maggi",
      quantity: 40,
      price: 15,
      cost: 10,
      expiry: "2026-03-01",
    },
  ];
};

// Add stock item
export const addStockItem = async (item) => {
  return { success: true, item };
};

// Update stock (sale / edit)
export const updateStock = async (itemName, soldQty) => {
  return { success: true };
};

// Activate / Deactivate product
export const toggleProductStatus = async (productName, active) => {
  return { success: true };
};

/* ================= SALES ================= */

// Daily sale entry
export const addDailySale = async ({ productName, quantity }) => {
  return {
    success: true,
    message: "Sale recorded",
  };
};

// Get today sales
export const getTodaySales = async () => {
  return [
    { product: "Milk", sold: 5 },
    { product: "Maggi", sold: 10 },
  ];
};

/* ================= ANALYTICS ================= */

// Profit analytics
export const getProfitAnalytics = async () => {
  return {
    totalProfit: 250,
    byProduct: [
      { name: "Milk", profit: 100 },
      { name: "Maggi", profit: 150 },
    ],
  };
};

// Inventory distribution
export const getInventoryAnalytics = async () => {
  return [
    { name: "Milk", quantity: 20 },
    { name: "Maggi", quantity: 40 },
  ];
};

/* ================= ALERTS ================= */

// Expiry alerts
export const getExpiryAlerts = async () => {
  return [
    {
      product: "Milk",
      expiry: "2026-01-10",
      daysLeft: 5,
    },
  ];
};

/* ================= AI SUGGESTIONS ================= */

// Sales suggestions (AI placeholder)
export const getSalesSuggestions = async () => {
  return [
    {
      product: "Milk",
      pairWith: ["Bread", "Biscuit"],
      offer: "Buy Milk + Bread & get 5% off",
    },
    {
      product: "Maggi",
      pairWith: ["Sauce", "Masala"],
      offer: "Buy 2 Maggi & get Sauce free",
    },
  ];
};
