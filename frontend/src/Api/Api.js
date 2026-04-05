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

/**
 * Demand prediction: Node → Python → MongoDB log (+ optional EOQ / demo economics).
 * @param {{ store_id: string, sku_id: string, data: Array<{date: string, sku_id: string, sales: number}>, ordering_cost?: number, holding_cost?: number, unit_margin?: number }} body
 */
export const submitPrediction = async (body) => {
  let res;
  try {
    res = await fetch(apiUrl("/api/predict"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/* ================= AUTH ================= */

// Demo login (email/password)
export const loginUser = async (email, password) => {
  if (email === "admin@retail.com" && password === "admin123") {
    return { role: "admin", token: "demo-admin-token" };
  }

  if (email === "staff@retail.com" && password === "staff123") {
    return { role: "staff", token: "demo-staff-token" };
  }

  throw new Error("Invalid credentials");
};

// Register user
export const registerUser = async (email, password, role) => {
  try {
    const res = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, role }),
    });

    return await res.json();
  } catch (error) {
    console.error(error);
    return { success: false };
  }
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
