# VectorAI Deployment Guide

This guide covers the production deployment setup for VectorAI with:
- **Frontend**: React app deployed on **Vercel**
- **Backend**: Express API deployed on **Render**
- **ML Engine**: FastAPI service deployed on **Render**

## Problem Statement

Initially, the frontend was making API requests to the Vercel frontend URL instead of the Render backend URL, causing:
```
POST https://my-vercel-app.vercel.app/api/auth/login 405 Method Not Allowed
```

This guide explains the fix and proper configuration.

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│   React Frontend (Vercel)            │
│   https://vector-ai-one-pi.vercel.app│
└──────────────┬──────────────────────┘
               │
         (API Requests)
               │
               ▼
┌─────────────────────────────────────┐
│   Express Backend (Render)           │
│   https://vectorai-v2-1.onrender.com│
├─────────────────────────────────────┤
│   - Authentication                   │
│   - Inventory Management             │
│   - Sales Tracking                   │
│   - ML Service Integration           │
└──────────────┬──────────────────────┘
               │
         (HTTP Requests)
               │
               ▼
┌─────────────────────────────────────┐
│   FastAPI ML Engine (Render)        │
│   (Internal, via backend)            │
└─────────────────────────────────────┘
```

---

## Frontend Configuration

### 1. Environment Variables Setup

**Production Environment** (`.env.production`)
```env
VITE_API_URL=https://vectorai-v2-1.onrender.com/api
```

**Development Environment** (`.env.local`)
```env
VITE_API_URL=
```

In development, leaving `VITE_API_URL` empty uses the Vite proxy (see below).

### 2. How Frontend Resolves API URLs

The `apiUrl()` function in `src/Api/Api.js` handles URL resolution:

```javascript
function apiOrigin() {
  const fromEnv = import.meta.env.VITE_API_URL;
  
  // 1. Use production URL if set
  if (fromEnv && String(fromEnv).trim()) 
    return String(fromEnv).replace(/\/$/, "");
  
  // 2. In development: use Vite proxy (empty string = same-origin)
  if (import.meta.env.DEV) 
    return "";
  
  // 3. In production (if no env var): use current host
  return typeof window !== "undefined" 
    ? window.location.origin 
    : "http://localhost:5000";
}
```

**Logic Flow:**
- **Production** (`https://vector-ai-one-pi.vercel.app`):
  - `import.meta.env.VITE_API_URL` = `https://vectorai-v2-1.onrender.com/api`
  - All requests go to Render backend ✅

- **Development** (localhost):
  - `import.meta.env.VITE_API_URL` = `` (empty)
  - Requests use Vite proxy to `http://localhost:5000`
  - Avoids CORS issues locally ✅

### 3. Vite Proxy Configuration

**File:** `frontend/vite.config.js`

```javascript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      secure: false,
      pathRewrite: {},  // Keep /api/* path as-is
    },
  },
}
```

**How it works:**
- Browser request: `GET http://localhost:3000/api/auth/login`
- Vite proxy forwards to: `GET http://localhost:5000/api/auth/login`
- No CORS errors because same-origin ✅

### 4. API Helper Functions

All API calls should use helper functions from `src/Api/Api.js` that use the `apiUrl()` helper:

```javascript
// ✅ CORRECT: Uses apiUrl()
export const loginUser = async (email, password) => {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  // ...
};

// ✅ CORRECT: Uses apiUrl()
export async function getRevenueTrend(weeks = 8, storeId = "store_1") {
  const q = new URLSearchParams({ weeks: String(weeks), storeId });
  const res = await fetch(apiUrl(`/api/dashboard/revenue-trend?${q}`), {
    headers: authHeaders(),
  });
  // ...
};

// ❌ AVOID: Hardcoded fetch paths
// const res = await fetch("/api/auth/login"); // Works in dev, breaks in prod!
```

### 5. Updated API Functions

New helper functions added to `src/Api/Api.js`:

```javascript
// Dashboard summary data
export async function getDashboardSummary(storeId = "store_1")

// Revenue trend chart data
export async function getRevenueTrend(weeks = 8, storeId = "store_1")

// Sales prediction chart data
export async function getSalesChart(storeId = "store_1", histWeeks = 8)
```

### 6. Updated Components

Components updated to use API helpers:
- `src/components/Analytics.jsx` → Uses `getRevenueTrend()`
- `src/components/SalesPredictionChart.jsx` → Uses `getSalesChart()`
- `src/pages/admin/Dashboard.jsx` → Uses `getDashboardSummary()`, `getDashboardSuggestions()`

---

## Backend Configuration

### 1. CORS Setup

**File:** `backend/server.js`

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',              // Local dev
      'http://127.0.0.1:3000',             // Local dev
      'https://vector-ai-one-pi.vercel.app' // Production Vercel
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`[CORS] Rejected origin: ${origin}`);
    return callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,                              // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400                                   // Cache preflight for 24h
}));
```

### 2. Environment Configuration

**File:** `backend/.env`

```env
# MongoDB connection string
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/database

# Server port (Render default: 5000)
PORT=5000

# CSV upload limit
MAX_CSV_SIZE_BYTES=10485760

# CORS Configuration - allowed frontend origins
# Format: comma-separated URLs (no spaces after commas)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://my-vercel-app.vercel.app
```

### 3. How CORS Works

When frontend makes a request:

```
Client (Vercel): GET https://my-vercel-app.vercel.app/api/auth/login
                          │
                          ▼
Server (Render):  Checks Origin header
                          │
                 ┌────────┴────────┐
                 ▼                  ▼
            In allowedOrigins?  Not allowed?
                 │                  │
                 ✅                 ❌
             Return data        Return 403
```

---

## Local Development Setup

### 1. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

- Runs on `http://localhost:3000`
- Requests to `/api/*` are proxied to `http://localhost:5000`
- No CORS issues ✅

### 2. Start Backend

```bash
cd backend
npm install
npm start
```

- Runs on `http://localhost:5000` (port in `.env`)
- Has CORS enabled for `http://localhost:3000`

### 3. Test Login Request

**In browser console:**
```javascript
// Development: Uses Vite proxy
const res = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@retail.com", password: "admin123" })
});
// Request goes to: http://localhost:5000/api/auth/login ✅
```

---

## Production Deployment

### 1. Frontend Deployment (Vercel)

**Step 1: Connect GitHub repository**
```
vercel.com → Import project → Select GitHub repo
```

**Step 2: Configure environment variables**
```
Settings → Environment Variables
Add: VITE_API_URL = https://vectorai-v2-1.onrender.com/api
```

**Step 3: Deploy**
```bash
vercel deploy --prod
```

**Result:**
- Production build uses `VITE_API_URL` from environment
- All requests go to Render backend
- Login request: `POST https://my-backend.onrender.com/api/auth/login` ✅

### 2. Backend Deployment (Render)

**Step 1: Deploy Express app**
```
render.com → New Web Service → Connect GitHub
```

**Step 2: Configure environment variables**
```
Environment Variables:
- MONGO_URI=mongodb+srv://...
- PORT=5000
- ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://vector-ai-one-pi.vercel.app
```

**Step 3: Set start command**
```
npm start
```

**Step 4: Deploy**
```
Deploy from git
```

### 3. Update ALLOWED_ORIGINS on Render

After Vercel deployment, the backend's `ALLOWED_ORIGINS` is already configured:

1. Go to Render dashboard
2. Find VectorAI backend service
3. Settings → Environment → Verify `ALLOWED_ORIGINS`:
   ```
   ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://vector-ai-one-pi.vercel.app
   ```
4. No changes needed - redeploy if you made other changes

---

## Troubleshooting

### Issue 1: Login returns 405 Method Not Allowed

**Cause:** Frontend is sending requests to Vercel instead of Render

**Solution:**
1. Check `.env.production` has correct `VITE_API_URL=https://vectorai-v2-1.onrender.com/api`
2. Rebuild frontend: `npm run build`
3. Redeploy to Vercel
4. Check network tab in browser: requests should go to `vectorai-v2-1.onrender.com`

### Issue 2: CORS error from browser

**Error:** 
```
Access to XMLHttpRequest at 'https://...' from origin 'https://...' has been blocked by CORS policy
```

**Solution:**
1. Check backend's `ALLOWED_ORIGINS` environment variable
2. Ensure it includes `https://vector-ai-one-pi.vercel.app`
3. Redeploy backend on Render
4. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)

### Issue 3: Login works in dev, fails in production

**Cause:** 
- Development uses Vite proxy (no CORS needed)
- Production doesn't have CORS configured correctly

**Solution:**
- Ensure `ALLOWED_ORIGINS` on backend includes production Vercel URL
- Check `.env.production` on frontend is set correctly

### Issue 4: ML predictions failing in production

**Cause:** Backend can't reach FastAPI ML engine

**Solution:**
1. Verify both backend and ML engine are deployed on Render
2. Check backend's ML service configuration uses internal Render URL
3. Ensure internal communication is allowed (same Render account)

---

## Testing Checklist

- [ ] Frontend builds without errors: `npm run build`
- [ ] Development login works: `npm run dev` → Test login at `localhost:3000`
- [ ] Production build works: Test `.env.production` locally
- [ ] Backend CORS accepts frontend origin
- [ ] All API endpoints use `apiUrl()` helper
- [ ] Network tab shows correct URLs:
  - Dev: `http://localhost:5000/api/*`
  - Prod: `https://my-backend.onrender.com/api/*`
- [ ] Login, dashboard, charts all work in production
- [ ] PDF export works in production

---

## File References

### Modified Files
1. **Frontend:**
   - `.env.production` - Production API URL
   - `.env.local` - Development API URL (empty)
   - `vite.config.js` - Proxy configuration
   - `src/Api/Api.js` - New helper functions
   - `src/components/Analytics.jsx` - Uses `getRevenueTrend()`
   - `src/components/SalesPredictionChart.jsx` - Uses `getSalesChart()`
   - `src/pages/admin/Dashboard.jsx` - Uses API helpers

2. **Backend:**
   - `.env` - CORS configuration
   - `server.js` - CORS middleware setup

---

## Key Concepts

### Same-Origin vs Cross-Origin

**Development (Same-Origin via Proxy):**
```
Browser → Vite (localhost:3000) → Express (localhost:5000)
         (No CORS needed: same origin in browser)
```

**Production (Cross-Origin):**
```
Browser → Vercel (my-vercel-app.vercel.app)
         → Render Backend (my-backend.onrender.com)
         (CORS required: different origins)
```

### CORS Headers

When CORS is enabled, responses include:
```
Access-Control-Allow-Origin: https://vector-ai-one-pi.vercel.app
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## References

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-modes.html)
- [CORS Explained](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Render Deployment](https://render.com/docs)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
