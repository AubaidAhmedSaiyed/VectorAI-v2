# 📊 Baseline Benchmark Instructions

## Prerequisites

### 1. Start MongoDB
Ensure your MongoDB is running (local or Atlas):
```bash
# If using local MongoDB
mongod

# Or make sure MONGO_URI is set in backend/.env pointing to Atlas
```

### 2. Start the ML Engine (Python FastAPI)
```bash
cd engine
source .venv/Scripts/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

### 3. Ensure Backend Dependencies
```bash
cd backend
npm install
```

### 4. Seed Test Data (Optional but Recommended)
If you don't have sales data yet, seed the database:
```bash
cd backend
npm run seed
```

---

## Running the Baseline Benchmark

### Start the Backend
```bash
cd backend
npm start
# Should see: "Server running on port 5000"
# Should see: "Connected to MongoDB"
```

### In a New Terminal, Run the Benchmark
```bash
cd backend

# Basic run (uses defaults: STORE1, SKU001)
node benchmark.js

# Or with custom store/SKU
STORE_ID=STORE1 SKU_ID=SKU001 node benchmark.js

# Or point to different backend
BACKEND_URL=http://your-server:5000 node benchmark.js
```

### What It Measures
1. **Single Forecast Request** (5 samples)
   - Mean, median, p95, p99 latency
   - Min/max response times

2. **Concurrent Load Test**
   - 1 concurrent, 5 concurrent, 10 concurrent
   - RPS (requests/second)
   - Error rates

3. **Health Check Latency** (10 samples)
   - Simple connectivity test

4. **Repeated Requests** (5 sequential calls)
   - No caching yet - all should be similar
   - Baseline for improvement measurement

5. **Multi-SKU Forecast**
   - Total time to forecast all SKUs for a store
   - Per-SKU cost

---

## Recording Your Results

Once the benchmark completes, update `BASELINE_BENCHMARK.md` with your numbers:

```bash
# Find these results in the benchmark output
# Example:
# Mean: 425ms
# Median (p50): 410ms
# p95: 520ms
# p99: 580ms
```

Then fill in `BASELINE_BENCHMARK.md` table with actual values.

---

## Interpreting Results

### Expected Baseline (No Optimization)
- **Single request latency**: 300-800ms (depending on DB size, network)
- **Database query**: 50-200ms
- **ML engine**: 100-300ms
- **Overhead**: 50-100ms

### Red Flags (Investigate)
- Mean latency **> 1000ms** → check DB connection or data volume
- Error rate **> 5%** → backend/ML engine issues
- Health check **> 100ms** → network latency or backend load

### Good Baseline Signs
- Consistent latency (low variance)
- Health check < 50ms
- Error rate = 0%

---

## Next: Measure Improvements

After implementing Redis caching:
```bash
# Re-run the same benchmark
node benchmark.js

# Compare results:
# - 1st forecast (cache miss): should be similar to baseline
# - 2nd-5th forecast (cache hit): should be ~20-50ms (10-20x faster!)
# - Multi-SKU forecast: should be 2-3x faster on second run
```

---

## Troubleshooting

### Connection Refused Errors
```
Error: connect ECONNREFUSED
```
**Solution**: Make sure backend is running (`npm start`)

### MongoDB Connection Failed
```
Error: Could not connect to MongoDB
```
**Solution**: Check MONGO_URI in `backend/.env`, ensure MongoDB is running

### ML Engine Not Responding
```
Error: request timed out to /api/ml/health
```
**Solution**: Start ML engine: `uvicorn app:app --host 0.0.0.0 --port 8000`

### No Sales Data Error
```
No sales data found for store "STORE1"
```
**Solution**: Run seed script: `npm run seed`

---

## Quick Command Reference

```bash
# Terminal 1: Database
mongod  # or ensure MongoDB is running

# Terminal 2: ML Engine
cd engine && source .venv/Scripts/activate && uvicorn app:app --port 8000

# Terminal 3: Backend
cd backend && npm start

# Terminal 4: Benchmark
cd backend && node benchmark.js
```

Save the output and record in `BASELINE_BENCHMARK.md`!
