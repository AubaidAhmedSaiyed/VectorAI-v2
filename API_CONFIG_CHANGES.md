# API Configuration Changes - Quick Reference

## Summary of Changes

Fixed frontend API requests to correctly route to Render backend instead of Vercel frontend.

---

## Frontend Changes

### 1. **Created `.env.production`**
```env
VITE_API_URL=https://vectorai-v2-1.onrender.com/api
```
- Tells frontend where the production backend is located

### 2. **Created `.env.local`**
```env
VITE_API_URL=
```
- Leaves URL empty for development
- Uses Vite proxy to `http://localhost:5000` instead

### 3. **Updated `vite.config.js`**
- Enhanced proxy configuration with comments
- Added `secure: false` and `pathRewrite: {}` for clarity

### 4. **Added API Helper Functions** (`src/Api/Api.js`)
```javascript
export async function getRevenueTrend(weeks = 8, storeId = "store_1")
export async function getSalesChart(storeId = "store_1", histWeeks = 8)
export async function getDashboardSummary(storeId = "store_1")
```

### 5. **Updated Components**
- `Analytics.jsx` - Uses `getRevenueTrend()` instead of hardcoded fetch
- `SalesPredictionChart.jsx` - Uses `getSalesChart()` instead of hardcoded fetch
- `Dashboard.jsx` - Uses `getDashboardSummary()` and `getDashboardSuggestions()` instead of hardcoded fetch

---

## Backend Changes

### 1. **Updated `server.js` - CORS Configuration**
```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://vector-ai-one-pi.vercel.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Rejected origin: ${origin}`);
    return callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
```

### 2. **Updated `.env` - CORS Origins**
```env
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://my-vercel-app.vercel.app
```
- Replace `my-vercel-app.vercel.app` with your actual Vercel URL after deployment

---

## How to Deploy

### Frontend (Vercel)

1. **Add environment variable in Vercel dashboard:**
   ```
   VITE_API_URL = https://your-render-backend.onrender.com/api
   ```

2. **Deploy:**
   ```bash
   vercel deploy --prod
   ```

### Backend (Render)

1. **Add environment variables in Render dashboard:**
   ```
   MONGO_URI = your-mongodb-connection-string
   PORT = 5000
   ALLOWED_ORIGINS = https://your-vercel-app.vercel.app,http://localhost:3000,http://127.0.0.1:3000
   ```

2. **Redeploy after updating ALLOWED_ORIGINS**

---

## API Request Flow

### Development
```
Browser (localhost:3000) 
    → Vite Proxy
    → Express Backend (localhost:5000)
```

### Production
```
Browser (https://my-vercel-app.vercel.app) 
    → CORS allowed
    → Express Backend (https://my-backend.onrender.com/api)
```

---

## Testing

### Local Development
```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend
cd backend
npm start
```

Test login at `http://localhost:3000` → Should work ✅

### Production
- Deploy frontend to Vercel with `.env.production`
- Deploy backend to Render with `ALLOWED_ORIGINS` set
- Test login at `https://vector-ai-one-pi.vercel.app` → Should work ✅

---

## Key Points

✅ **All API calls use `apiUrl()` helper** - Automatically resolves to correct URL  
✅ **Environment variables manage URLs** - No hardcoding  
✅ **Development uses proxy** - No CORS issues locally  
✅ **Production uses CORS** - Secure cross-origin requests  
✅ **Fallback support** - Code works even without env vars  

---

## If Login Still Fails

1. Check network tab → Is request going to Render backend?
   - ❌ Wrong: `https://vector-ai-one-pi.vercel.app/api/auth/login`
   - ✅ Correct: `https://vectorai-v2-1.onrender.com/api/auth/login`

2. Check CORS headers in response
3. Check `ALLOWED_ORIGINS` on backend includes your Vercel URL
4. Clear browser cache and try again

---

## Files Modified

- ✅ `frontend/.env.production` - Created
- ✅ `frontend/.env.local` - Created
- ✅ `frontend/vite.config.js` - Updated
- ✅ `frontend/src/Api/Api.js` - Added 3 new functions
- ✅ `frontend/src/components/Analytics.jsx` - Updated
- ✅ `frontend/src/components/SalesPredictionChart.jsx` - Updated
- ✅ `frontend/src/pages/admin/Dashboard.jsx` - Updated
- ✅ `backend/server.js` - Updated CORS configuration
- ✅ `backend/.env` - Updated with ALLOWED_ORIGINS
