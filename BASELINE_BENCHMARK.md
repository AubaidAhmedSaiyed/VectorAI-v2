# VectorAI Baseline Performance Benchmark
**Date**: June 2, 2026  
**Purpose**: Establish baseline metrics BEFORE optimization (Redis, Prometheus, caching)

## 📊 Current Architecture Baseline

### Environment Setup
- Backend: Express.js on Node.js 18+
- ML Engine: FastAPI on Python 3.9+
- Database: MongoDB (Atlas or local)
- Cache: NONE (direct DB queries)
- No Prometheus instrumentation
- No Redis

---

## 🔬 Benchmark Results (To Be Populated)

### 1. Single Forecast Request (No Cache)
| Metric | Value | Notes |
|--------|-------|-------|
| Mean Response Time | ___ ms | GET /api/ml/forecast/STORE1/SKU001 |
| Median (p50) | ___ ms | |
| 95th percentile (p95) | ___ ms | |
| 99th percentile (p99) | ___ ms | |
| Database Query Time | ___ ms | MongoDB query for sales data |
| ML Engine Time | ___ ms | FastAPI forecast generation |
| Overhead (serialization/network) | ___ ms | |

### 2. Throughput Under Load (Baseline)
| Scenario | RPS | p95 Latency | Error Rate | Notes |
|----------|-----|-------------|-----------|-------|
| Single client, sequential | ___ | ___ ms | ___ % | 10 requests |
| 5 concurrent clients | ___ | ___ ms | ___ % | 50 requests total |
| 10 concurrent clients | ___ | ___ ms | ___ % | 100 requests total |
| Spike: 50 RPS for 10s | ___ | ___ ms | ___ % | Stress test |

### 3. Database Performance
| Query | Mean Time | Records | Notes |
|-------|-----------|---------|-------|
| `Sale.find({store_id})` | ___ ms | ___ | Full sales data pull for 1 store |
| `Sale.find({store_id, sku_id})` | ___ ms | ___ | Filtered by SKU |
| `Sale.distinct('sku_id')` | ___ ms | ___ | Get unique SKUs |

### 4. ML Engine Performance
| Operation | Time | Dataset Size | Notes |
|-----------|------|--------------|-------|
| Forecast generation (1 SKU) | ___ ms | ___ records | Single prediction |
| Training (all SKUs, 1 store) | ___ ms | ___ records | Full model training |
| Health check | ___ ms | - | Simple connectivity test |

### 5. Resource Usage (Baseline)
| Resource | Usage | Notes |
|----------|-------|-------|
| Backend Memory | ___ MB | Idle, then during forecast |
| Backend CPU | ___ % | Peak during forecast |
| MongoDB Connections | ___ | Active connections |
| ML Engine Memory | ___ MB | After model load |

### 6. Repeated Request Pattern (Cache Miss)
| Request # | Response Time | Delta | Notes |
|-----------|---------------|-------|-------|
| 1st (cold) | ___ ms | - | Database + ML engine |
| 2nd (same params) | ___ ms | ___ ms | No cache yet |
| 3rd (same params) | ___ ms | ___ ms | No cache yet |
| **Avg latency (no cache)** | ___ ms | - | Baseline |

---

## 🎯 Optimization Targets (Post-Benchmark Goals)

### Targets After Adding Redis
- Single forecast latency: **< 50ms** (from ~~500ms~~)  → **10x faster**
- Cache hit latency: **~20ms** (network roundtrip only)
- Cache hit rate: **> 70%** on repeated forecast patterns
- Memory overhead: **< 100MB** for Redis

### Targets After Adding Prometheus
- Request instrumentation: **100%** coverage (no perf regression)
- Metric collection overhead: **< 2%** of request time
- Cardinality: **< 1000** unique metric combinations

### Targets After Load Testing
- Sustained throughput: **100+ RPS** at **p95 < 500ms**
- Error rate: **< 1%** under load
- Scalability: Linear with available resources

### Targets After Full Stack
- **Full end-to-end latency**: **< 200ms p95** with Redis + Prometheus
- **Throughput**: **200+ RPS** sustained
- **Cost per request**: **< 5ms compute time** (vs 500ms baseline)

---

## 📝 How to Run Baseline Benchmark

### Prerequisites
```bash
cd backend
npm install  # Ensure all deps installed
npm install autocannon  # For load testing
```

### Run Benchmarks
```bash
# Start backend & ML engine first
npm start
# (In another terminal)
python ../engine/app.py

# Run benchmark script
node benchmark.js
```

---

## 📌 Next Steps
1. ✅ Run baseline benchmark (GET NUMBERS)
2. Implement Redis caching
3. Re-run benchmark (MEASURE IMPROVEMENTS)
4. Add Prometheus instrumentation
5. Create Grafana dashboards
6. Run k6 load tests
7. Document final metrics

---

## 💾 Benchmark Data Location
- Results: `./BASELINE_RESULTS.json`
- Comparison: See `OPTIMIZATION_RESULTS.md` (post-Redis)
