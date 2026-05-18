# Production Authentication & CORS Fix

## Problem Statement

Frontend login was failing with:
```
POST https://vectorai-v2-1.onrender.com/api/api/auth/login 405 Method Not Allowed
CORS policy error
```

**Two Critical Issues:**
1. **Double `/api` in URL** - Request going to wrong endpoint
2. **CORS blocked the request** - Even if URL was correct

---

## Root Cause Analysis

### Issue 1: Double `/api` Path

#### What Was Happening:

**Old Configuration:**
```env
VITE_API_URL=https://vectorai-v2-1.onrender.com/api
```

**Frontend Code (Api.js):**
```javascript
function apiUrl(path) {
  const root = apiOrigin(); // Returns: https://vectorai-v2-1.onrender.com/api
  const p = path.startsWith("/") ? path : `/${path}`;
  return root ? `${root}${p}` : p;
}

// API calls:
apiUrl("/api/auth/login")
// ↓
// https://vectorai-v2-1.onrender.com/api + /api/auth/login
// ↓
// https://vectorai-v2-1.onrender.com/api/api/auth/login  ❌ WRONG!
```

#### Why This Happened:

The pattern used in the frontend code:
- `apiUrl()` combines base URL + path
- Base URL (`VITE_API_URL`) was set WITH `/api`
- Paths (`"/api/auth/login"`) also included `/api`
- Result: `/api` + `/api/auth/login` = **Double `/api/`**

#### The Fix:

**New Configuration:**
```env
VITE_API_URL=https://vectorai-v2-1.onrender.com
```

**How It Works Now:**
```javascript
function apiUrl(path) {
  const root = apiOrigin(); // Returns: https://vectorai-v2-1.onrender.com (no /api)
  const p = path.startsWith("/") ? path : `/${path}`;
  return root ? `${root}${p}` : p;
}

// API calls:
apiUrl("/api/auth/login")
// ↓
// https://vectorai-v2-1.onrender.com + /api/auth/login
// ↓
// https://vectorai-v2-1.onrender.com/api/auth/login  ✅ CORRECT!
```

**Key Principle:** Environment variables should contain ONLY the base domain URL. Paths are added by the function.

---

### Issue 2: CORS Policy Blocked Request

#### What Was Happening:

**Browser Preflight Request:**
```
OPTIONS /api/auth/login HTTP/1.1
Origin: https://vector-ai-one-pi.vercel.app
```

**Backend Checked:**
```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://my-vercel-app.vercel.app'  // ❌ Wrong! Not the actual URL
];

// Request came from: https://vector-ai-one-pi.vercel.app
// Checking against: https://my-vercel-app.vercel.app
// Result: NOT IN LIST → CORS BLOCKED ❌
```

#### Why This Happened:

The placeholder URL `my-vercel-app.vercel.app` wasn't updated to the actual production URL `vector-ai-one-pi.vercel.app`.

#### The Fix:

**Updated Backend CORS:**
```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',              // Local dev
      'http://127.0.0.1:3000',              // Local dev
      'https://vector-ai-one-pi.vercel.app' // ✅ Production Vercel
    ];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Accepted origin: ${origin}`);
      return callback(null, true);
    }
    console.warn(`[CORS] ❌ Rejected origin: ${origin}`);
    return callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400
}));
```

**Backend .env:**
```env
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://vector-ai-one-pi.vercel.app
```

---

## How CORS Works (Why It Was Failing)

### CORS Preflight Request Flow

```
1️⃣ Browser detects cross-origin request
   Client: https://vector-ai-one-pi.vercel.app
   Destination: https://vectorai-v2-1.onrender.com

2️⃣ Browser sends OPTIONS preflight:
   OPTIONS /api/auth/login
   Host: vectorai-v2-1.onrender.com
   Origin: https://vector-ai-one-pi.vercel.app
   Access-Control-Request-Method: POST

3️⃣ Server checks allowedOrigins array
   ❌ https://vector-ai-one-pi.vercel.app NOT IN LIST
   → Server rejects: 403 Forbidden

4️⃣ Browser blocks actual request
   Error: CORS policy error
```

### After Fix

```
1️⃣ Browser detects cross-origin request

2️⃣ Browser sends OPTIONS preflight:
   OPTIONS /api/auth/login
   Origin: https://vector-ai-one-pi.vercel.app

3️⃣ Server checks allowedOrigins array
   ✅ https://vector-ai-one-pi.vercel.app FOUND!
   → Server responds with CORS headers:
      Access-Control-Allow-Origin: https://vector-ai-one-pi.vercel.app
      Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
      Access-Control-Allow-Credentials: true

4️⃣ Browser allows actual request ✅
   POST /api/auth/login → Server processes normally
```

---

## Backend Route Configuration

### Verified Routes

All backend routes are correctly defined:

```javascript
// ✅ CORRECT - includes /api prefix in route path
app.post('/api/auth/register', ...)   // POST /api/auth/register
app.post('/api/auth/login', ...)      // POST /api/auth/login
app.get('/api/auth/me', ...)          // GET /api/auth/me
app.post('/api/products', ...)        // POST /api/products
app.post('/api/inventory', ...)       // POST /api/inventory
app.post('/api/sales', ...)           // POST /api/sales
app.post('/api/predict', ...)         // POST /api/predict
// ... etc
```

No additional `/api` prefix is added by Express middleware - routes handle it correctly.

---

## Frontend API Configuration Verification

### apiUrl() Function (Correct Implementation)

**File:** `src/Api/Api.js`

```javascript
function apiOrigin() {
  const fromEnv = import.meta.env.VITE_API_URL;
  
  // Priority 1: Use environment variable if set
  if (fromEnv && String(fromEnv).trim()) 
    return String(fromEnv).replace(/\/$/, "");
  
  // Priority 2: Development uses Vite proxy (empty string)
  if (import.meta.env.DEV) 
    return "";
  
  // Priority 3: Fallback to current origin or localhost
  return typeof window !== "undefined" 
    ? window.location.origin 
    : "http://localhost:5000";
}

function apiUrl(path) {
  const root = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return root ? `${root}${p}` : p;
}
```

### API Calls (All Correct)

All API calls use the proper path with `/api`:

```javascript
// ✅ CORRECT - path includes /api
export const loginUser = async (email, password) => {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  // ...
};

export async function getRevenueTrend(weeks = 8, storeId = "store_1") {
  const q = new URLSearchParams({ weeks: String(weeks), storeId });
  const res = await fetch(apiUrl(`/api/dashboard/revenue-trend?${q}`), {
    headers: authHeaders(),
  });
  // ...
};

// All other API calls follow the same pattern:
// apiUrl("/api/...") - paths include /api
```

---

## Production Architecture

```
┌──────────────────────────────────────────┐
│   React Frontend (Vercel)                 │
│   https://vector-ai-one-pi.vercel.app    │
│                                           │
│   Environment: VITE_API_URL =             │
│   https://vectorai-v2-1.onrender.com     │
└─────────────────┬────────────────────────┘
                  │
         (HTTPS Request + CORS)
                  │
                  ▼
┌──────────────────────────────────────────┐
│   Express Backend (Render)                │
│   https://vectorai-v2-1.onrender.com/api │
│                                           │
│   CORS Allows:                            │
│   - https://vector-ai-one-pi.vercel.app  │
│   - http://localhost:3000 (dev)          │
│   - http://127.0.0.1:3000 (dev)          │
│                                           │
│   Routes:                                 │
│   - POST /api/auth/login                 │
│   - POST /api/auth/register              │
│   - GET /api/auth/me                     │
│   - POST /api/predict                    │
│   - GET /api/dashboard/*                 │
│   - ... (all prefixed with /api)         │
└─────────────────┬────────────────────────┘
                  │
         (HTTP Internal Request)
                  │
                  ▼
┌──────────────────────────────────────────┐
│   FastAPI ML Engine (Render)              │
│   (Internal service)                      │
└──────────────────────────────────────────┘
```

---

## Request Flow Example: Login

### Development (localhost)

```
Frontend (http://localhost:3000)
  ↓ fetch(apiUrl("/api/auth/login"))
  ↓ apiOrigin() returns "" (empty string in DEV)
  ↓ apiUrl() returns "/api/auth/login"
  ↓
Vite Proxy intercepts "/api/*" requests
  ↓ Forwards to http://localhost:5000
  ↓
Backend (http://localhost:5000/api/auth/login)
  ✅ CORS: localhost:3000 IS in allowedOrigins
  ✅ Route: POST /api/auth/login EXISTS
  ✅ Response: { token, user, role }
```

### Production (Vercel + Render)

```
Frontend (https://vector-ai-one-pi.vercel.app)
  ↓ fetch(apiUrl("/api/auth/login"))
  ↓ apiOrigin() returns "https://vectorai-v2-1.onrender.com"
  ↓ apiUrl() returns "https://vectorai-v2-1.onrender.com/api/auth/login"
  ↓
Browser Preflight:
  OPTIONS /api/auth/login
  Origin: https://vector-ai-one-pi.vercel.app
  ↓
Backend CORS Check:
  ✅ https://vector-ai-one-pi.vercel.app IS in allowedOrigins
  ✅ Respond with Access-Control-Allow-* headers
  ↓
Browser Actual Request:
  POST /api/auth/login
  Authorization: Bearer {token}
  ↓
Backend (https://vectorai-v2-1.onrender.com/api/auth/login)
  ✅ CORS: Verified in preflight
  ✅ Route: POST /api/auth/login EXISTS
  ✅ Response: { token, user, role }
```

---

## Configuration Summary

### Frontend (.env.production)
```env
# ✅ NEW: Base URL only (no /api suffix)
VITE_API_URL=https://vectorai-v2-1.onrender.com
```

### Backend (.env)
```env
MONGO_URI=mongodb+srv://...
PORT=5000
MAX_CSV_SIZE_BYTES=10485760

# ✅ CORRECT: All allowed origins
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://vector-ai-one-pi.vercel.app
```

### Backend (server.js - CORS Middleware)
```javascript
// ✅ UPDATED: Correct Vercel URL
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://vector-ai-one-pi.vercel.app' // ✅ Production URL
    ];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Accepted origin: ${origin}`);
      return callback(null, true);
    }
    console.warn(`[CORS] ❌ Rejected origin: ${origin}`);
    return callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400
}));
```

---

## Deployment Checklist

- [x] **Frontend:**
  - [x] `.env.production` has `VITE_API_URL=https://vectorai-v2-1.onrender.com` (NO `/api`)
  - [x] All API calls use `apiUrl("/api/...")` format
  - [x] Build: `npm run build`
  - [ ] Deploy to Vercel: `vercel deploy --prod`

- [x] **Backend:**
  - [x] `server.js` CORS allows `https://vector-ai-one-pi.vercel.app`
  - [x] `.env` has `ALLOWED_ORIGINS` configured
  - [x] Routes defined as `/api/auth/login`, `/api/predict`, etc.
  - [x] CORS middleware placed BEFORE routes
  - [ ] Redeploy on Render

---

## Testing After Deployment

### 1. Check Network Requests

Open browser DevTools → Network tab:

**Login Request should show:**
```
POST https://vectorai-v2-1.onrender.com/api/auth/login

✅ Correct URL (single /api)
✅ Status: 200 (or 401 for invalid credentials)
✅ Response headers include: Access-Control-Allow-*
```

### 2. Check Console Errors

**Should NOT see:**
```
❌ CORS policy: Access to XMLHttpRequest at 'https://...' from origin 'https://...' 
   has been blocked by CORS policy
❌ /api/api/auth/login (double /api)
```

### 3. Check Backend Logs

When login request arrives:
```
[CORS] ✅ Accepted origin: https://vector-ai-one-pi.vercel.app
[POST] /api/auth/login
```

---

## Common Issues & Fixes

### Issue: Still seeing `/api/api/` in URL

**Cause:** Environment variable still includes `/api`

**Fix:**
```env
# ❌ WRONG
VITE_API_URL=https://vectorai-v2-1.onrender.com/api

# ✅ CORRECT
VITE_API_URL=https://vectorai-v2-1.onrender.com
```

Then rebuild: `npm run build`

### Issue: CORS still being blocked

**Cause:** `ALLOWED_ORIGINS` doesn't match request origin exactly

**Fix:** Check browser console:
```javascript
// Open console and run:
window.location.origin  // Should match an entry in ALLOWED_ORIGINS
```

Make sure backend `.env` has this exact origin in `ALLOWED_ORIGINS`.

### Issue: Login works but other endpoints fail

**Cause:** Some endpoints use hardcoded URLs or missing auth headers

**Fix:** Ensure all API calls use:
1. `apiUrl()` function (not hardcoded paths)
2. `authHeaders()` or `jsonAuthHeaders()` for authentication

---

## Why This Architecture Works

1. **Single Base URL:** Environment variable contains ONLY domain
2. **Consistent Paths:** All API calls include `/api` prefix
3. **CORS Configuration:** Exactly matches production origin
4. **Credentials:** CORS allows cookies and Authorization headers
5. **Preflight Handling:** OPTIONS requests cached for 24 hours
6. **Logging:** Debug logs show exactly what's being rejected/accepted

---

## Next Steps

1. **Rebuild Frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Redeploy to Vercel:**
   ```bash
   vercel deploy --prod
   ```

3. **Verify Backend Running:**
   - Check Render dashboard
   - Confirm `.env` has correct `ALLOWED_ORIGINS`
   - Redeploy if needed

4. **Test Production:**
   - Open https://vector-ai-one-pi.vercel.app
   - Try login with `admin@retail.com / admin123`
   - Check DevTools network tab for correct URLs
   - No CORS errors should appear

5. **Monitor:**
   - Watch Render backend logs for `[CORS]` messages
   - Verify all API endpoints work (dashboard, predict, etc.)
   - Test with production data

