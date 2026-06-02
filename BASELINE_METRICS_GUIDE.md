# 📈 Baseline Metrics Collection Guide

## Why Baseline Metrics Matter

Before implementing **ANY** optimization (Redis, Prometheus, caching, etc.), we need concrete **"before" numbers** to prove the value of improvements.

**Without baseline metrics:**
- ❌ Can't prove Redis actually speeds things up
- ❌ Can't calculate real ROI
- ❌ Can't show improvement graphs for internship applications
- ❌ Can't optimize what you can't measure

**With baseline metrics:**
- ✅ Show 5-10x latency improvement with data
- ✅ Calculate exact cache hit rates
- ✅ Demonstrate scalability gains
- ✅ Professional engineering positioning

---

## What Numbers We're Collecting

### 1. **Latency Metrics** (Response Time)
**Why it matters**: Shows how fast the API responds

| Metric | What It Tells Us | Target After Redis |
|--------|-----------------|-------------------|
| **Mean** | Average response time | 5-10x improvement |
| **p95** | 95% of requests finish in this time | < 100ms (from ~500ms) |
| **p99** | Worst-case real-world scenario | < 200ms (from ~800ms) |

**Example:**
- Current: Mean = 425ms, p95 = 520ms
- After Redis: Mean = 45ms (on cache hit), p95 = 70ms
- **Claim**: "Reduced forecast latency by 9.4x using Redis caching"

---

### 2. **Throughput Metrics** (Requests Per Second)
**Why it matters**: Shows how many requests the system can handle

| Metric | What It Tells Us | Target After Optimization |
|--------|-----------------|--------------------------|
| **RPS** | How many requests/second | 5-10x higher |
| **Concurrent Users** | Real-world load capacity | 100+ sustainable |
| **Error Rate** | Reliability under load | < 1% |

**Example:**
- Current: 5 concurrent → 8.5 RPS, p95 = 450ms
- After Redis: 5 concurrent → 60 RPS, p95 = 150ms
- **Claim**: "7x throughput improvement with optimized caching and query batching"

---

### 3. **Component-Level Metrics** (Where Time Is Spent)
**Why it matters**: Identifies bottlenecks for targeted optimization

```
Total Request Time: 425ms
├─ Network/Overhead: 50ms
├─ Database Query: 150ms
├─ ML Engine: 200ms
└─ Serialization: 25ms
```

**Optimization Opportunities:**
- Database slow? → Add indexes, query optimization
- ML Engine slow? → Batch predictions, caching
- Network slow? → Check backend location, connection pooling

---

### 4. **Cache Pattern Metrics** (Before Cache Implementation)
**Why it matters**: Baseline shows why caching is needed

```
Request Pattern (Same forecast, repeated):
1st request: 425ms (cold, compute needed)
2nd request: 425ms (no cache yet, recompute)
3rd request: 425ms (no cache yet, recompute)
4th request: 425ms (no cache yet, recompute)
5th request: 425ms (no cache yet, recompute)

Total time: 2,125ms
Average: 425ms per request

After Redis (same 5 requests):
1st request: 425ms (cache miss, compute needed)
2nd request: 35ms  (cache hit! network latency only)
3rd request: 32ms  (cache hit!)
4th request: 38ms  (cache hit!)
5th request: 30ms  (cache hit!)

Total time: 560ms
Average: 112ms per request
→ 3.8x faster for repeated patterns
```

**Talking point for applications:**
"Implemented Redis caching layer reducing repeated forecast requests from 425ms to ~30ms (14x improvement), increasing throughput from 8.5 to 85+ RPS"

---

### 5. **Scale Metrics** (Single SKU vs Multi-SKU)
**Why it matters**: Shows system behavior at different scale levels

```
Single Forecast (1 SKU):
├─ STORE1/SKU001: 425ms

Multi-SKU Forecast (all SKUs for store):
├─ STORE1 (10 SKUs): 4,250ms (4.25s per SKU avg)
├─ STORE1 (50 SKUs): 21,250ms (425ms per SKU - good parallelization!)
└─ STORE1 (100 SKUs): 42,500ms - possible bottleneck at 100 SKUs
```

**Optimization opportunity:**
"Batch forecast requests and parallel processing can reduce 100-SKU forecast from 42s to ~4s using concurrent ML inference"

---

## Concrete Numbers We Need

Fill in this template after running `node benchmark.js`:

```
# BASELINE METRICS (Current System, No Cache/Monitoring)

## Test Date: [TODAY]
## Backend Status: [RUNNING/LOCAL]
## Database: [MONGO_URI]
## ML Engine: [RUNNING]
## Data Volume: [# of sales records]

### Single Forecast (5 requests)
- Mean latency: ___ ms
- Median (p50): ___ ms
- p95: ___ ms
- p99: ___ ms
- Error rate: ___ %

### Throughput (1 concurrent, 10 requests)
- Requests/sec: ___ RPS
- Total time: ___ ms
- Error rate: ___ %

### Throughput (5 concurrent, 50 requests)
- Requests/sec: ___ RPS
- p95 latency: ___ ms
- Error rate: ___ %

### Health Check (10 requests)
- Mean latency: ___ ms

### Repeated Requests (Same params, 5 requests)
- 1st: ___ ms (cold)
- 2nd: ___ ms (same as 1st - no cache)
- 3rd: ___ ms (same as 1st - no cache)
- Avg: ___ ms

### Multi-SKU Forecast (All SKUs for STORE1)
- Total time: ___ ms
- SKU count: ___
- Avg per SKU: ___ ms
```

---

## How to Use These Numbers

### In Your Resume/Portfolio:
> "Optimized AI forecasting platform achieving 5-10x latency improvements:
> - Baseline: 425ms avg latency, 8.5 RPS
> - With Redis: 45ms avg latency (10-50ms on cache hit), 80+ RPS
> - 14x speedup on repeated forecast requests"

### In Your GitHub README:
```markdown
## Performance Benchmarks

### Before Optimization
- Single forecast: 425ms p50, 520ms p95
- Throughput: 8.5 RPS (5 concurrent)
- Cache hits: 0% (no cache)

### After Optimization (Redis + Prometheus)
- Single forecast: 45ms p50 (cache hit), 70ms p95
- Throughput: 80+ RPS (5 concurrent)
- Cache hits: 75%+ on repeated patterns

**Result: 9.4x latency improvement, 9.4x throughput improvement**
```

### In Behavioral Interviews:
> "I started by establishing baseline metrics - 425ms per forecast, 8.5 RPS throughput.
> Then I identified the bottleneck was repeated database queries for the same sales data.
> I implemented Redis caching, which dropped repeated requests to 30-40ms (14x faster).
> This increased our throughput to 80+ RPS, allowing the platform to handle 10x more concurrent users."

---

## Next Steps (In Order)

1. ✅ **Run baseline benchmark** → Get actual numbers
2. 📝 **Record baseline metrics** → Save to BASELINE_BENCHMARK.md
3. 🔴 **Implement Redis** → Add caching layer
4. 🔄 **Re-run benchmark** → Measure improvements
5. 📊 **Compare numbers** → Show before/after
6. 📈 **Document results** → Professional metrics report

---

## Quick Start Command

```bash
# Ensure all services are running, then:
cd backend
npm install
node benchmark.js

# Save output to terminal history or file:
node benchmark.js | tee baseline-results.txt
```

**Time to complete**: ~3-5 minutes depending on database size

---

## Files Created
- `benchmark.js` - Automated benchmark script
- `BASELINE_BENCHMARK.md` - Results template
- `RUN_BASELINE_BENCHMARK.md` - Detailed instructions
- This guide - Explains why and what to measure

**You're reading this? Great! The scripts are ready. Now run the benchmark!**
