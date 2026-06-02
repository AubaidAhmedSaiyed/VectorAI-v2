/**
 * benchmark.js - Baseline Performance Benchmark Script
 * 
 * Measures:
 * - Single forecast request latency
 * - Throughput under various loads
 * - Database query times
 * - ML engine response times
 * - Resource usage patterns
 * 
 * Usage:
 *   node benchmark.js
 */

const http = require('http');
const https = require('https');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const STORE_ID = process.env.STORE_ID || 'STORE1';
const SKU_ID = process.env.SKU_ID || 'SKU001';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Make HTTP request and measure time
 */
function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VectorAI-Benchmark'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, duration, data: json, success: res.statusCode < 400 });
        } catch {
          resolve({ status: res.statusCode, duration, data: data, success: false });
        }
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      reject({ error: err.message, duration });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Calculate percentiles
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Format table
 */
function table(headers, rows) {
  const colWidths = headers.map((h, i) => Math.max(h.length, Math.max(...rows.map(r => String(r[i] || '').length))));
  const sep = '+' + colWidths.map(w => '─'.repeat(w + 2)).join('+') + '+';
  
  console.log(sep);
  console.log('│ ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ') + ' │');
  console.log(sep);
  
  rows.forEach(row => {
    console.log('│ ' + row.map((v, i) => String(v).padEnd(colWidths[i])).join(' │ ') + ' │');
  });
  
  console.log(sep);
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Tests
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkSingleForecast() {
  console.log('\n📊 TEST 1: Single Forecast Request');
  console.log('─'.repeat(60));
  
  const timings = [];
  
  for (let i = 0; i < 5; i++) {
    try {
      const url = `${BACKEND_URL}/api/ml/forecast/${STORE_ID}/${SKU_ID}`;
      const result = await makeRequest(url);
      
      if (result.success) {
        timings.push(result.duration);
        console.log(`  Request ${i + 1}: ${result.duration}ms ✓`);
      } else {
        console.log(`  Request ${i + 1}: FAILED (${result.status})`);
      }
    } catch (e) {
      console.log(`  Request ${i + 1}: ERROR - ${e.error}`);
    }
  }

  if (timings.length > 0) {
    const mean = Math.round(timings.reduce((a, b) => a + b) / timings.length);
    const median = percentile(timings, 50);
    const p95 = percentile(timings, 95);
    const p99 = percentile(timings, 99);
    const min = Math.min(...timings);
    const max = Math.max(...timings);

    console.log('\nResults:');
    table(
      ['Metric', 'Value', 'Notes'],
      [
        ['Mean', `${mean}ms`, 'Average response time'],
        ['Median (p50)', `${median}ms`, 'Middle value'],
        ['p95', `${p95}ms`, '95th percentile'],
        ['p99', `${p99}ms`, '99th percentile'],
        ['Min', `${min}ms`, 'Fastest request'],
        ['Max', `${max}ms`, 'Slowest request'],
      ]
    );

    return { mean, median, p95, p99, min, max, count: timings.length };
  }

  return null;
}

async function benchmarkConcurrentLoad() {
  console.log('\n📊 TEST 2: Concurrent Load Test');
  console.log('─'.repeat(60));

  const scenarios = [
    { name: '1 concurrent', count: 1, requests: 10 },
    { name: '5 concurrent', count: 5, requests: 50 },
    { name: '10 concurrent', count: 10, requests: 100 }
  ];

  const results = [];

  for (const scenario of scenarios) {
    console.log(`\nTesting: ${scenario.name} (${scenario.requests} total requests)`);

    const timings = [];
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;

    // Launch concurrent requests
    const promises = [];
    for (let i = 0; i < scenario.requests; i++) {
      promises.push(
        makeRequest(`${BACKEND_URL}/api/ml/forecast/${STORE_ID}/${SKU_ID}`)
          .then(result => {
            if (result.success) {
              timings.push(result.duration);
            } else {
              errors++;
            }
            completed++;
            process.stdout.write(`\r  Progress: ${completed}/${scenario.requests}`);
          })
          .catch(e => {
            errors++;
            completed++;
            process.stdout.write(`\r  Progress: ${completed}/${scenario.requests}`);
          }),
        // Rate limit: only allow N concurrent at a time
        new Promise(resolve => {
          if (promises.length >= scenario.count) {
            setTimeout(resolve, 10);
          } else {
            resolve();
          }
        })
      );
    }

    await Promise.allSettled(promises);
    const totalTime = Date.now() - startTime;

    if (timings.length > 0) {
      const mean = Math.round(timings.reduce((a, b) => a + b) / timings.length);
      const p95 = percentile(timings, 95);
      const rps = (scenario.requests / (totalTime / 1000)).toFixed(1);
      const errorRate = ((errors / scenario.requests) * 100).toFixed(1);

      results.push([
        scenario.name,
        `${rps} RPS`,
        `${p95}ms`,
        `${errorRate}%`,
        `${mean}ms mean`
      ]);

      console.log(`\n  ✓ Completed in ${totalTime}ms`);
    }
  }

  if (results.length > 0) {
    console.log('\nResults:');
    table(
      ['Scenario', 'Throughput', 'p95 Latency', 'Error Rate', 'Mean Latency'],
      results
    );
  }
}

async function benchmarkHealthCheck() {
  console.log('\n📊 TEST 3: Health Check Latency');
  console.log('─'.repeat(60));

  const timings = [];

  for (let i = 0; i < 10; i++) {
    try {
      const result = await makeRequest(`${BACKEND_URL}/api/ml/health`);
      if (result.success) {
        timings.push(result.duration);
      }
    } catch (e) {
      // Ignore
    }
  }

  if (timings.length > 0) {
    const mean = Math.round(timings.reduce((a, b) => a + b) / timings.length);
    console.log(`Health check latency: ${mean}ms (${timings.length} samples)`);
  }
}

async function benchmarkRepeatedRequests() {
  console.log('\n📊 TEST 4: Repeated Request Pattern (Cache Miss - Baseline)');
  console.log('─'.repeat(60));

  const url = `${BACKEND_URL}/api/ml/forecast/${STORE_ID}/${SKU_ID}`;
  const results = [];

  for (let i = 1; i <= 5; i++) {
    try {
      const result = await makeRequest(url);
      if (result.success) {
        results.push({ request: i, latency: result.duration });
        console.log(`  Request ${i}: ${result.duration}ms`);
      }
    } catch (e) {
      console.log(`  Request ${i}: ERROR`);
    }
  }

  if (results.length > 0) {
    const mean = Math.round(results.reduce((sum, r) => sum + r.latency, 0) / results.length);
    console.log(`\n  Average latency (no cache): ${mean}ms`);
    console.log(`  ⚠️ Note: After adding Redis, this should drop to ~20-50ms`);
  }
}

async function benchmarkMultiSKUForecast() {
  console.log('\n📊 TEST 5: Multi-SKU Forecast (All SKUs for Store)');
  console.log('─'.repeat(60));

  try {
    const startTime = Date.now();
    const result = await makeRequest(`${BACKEND_URL}/api/ml/forecast/${STORE_ID}`);
    const duration = Date.now() - startTime;

    if (result.success) {
      const skuCount = Array.isArray(result.data.forecasts) ? result.data.forecasts.length : 0;
      console.log(`\nResults:`);
      console.log(`  Total latency: ${duration}ms`);
      console.log(`  SKU count: ${skuCount}`);
      console.log(`  Avg time per SKU: ${(duration / skuCount).toFixed(1)}ms`);
      console.log(`  ⚠️ Note: This will improve significantly with caching after first run`);
    } else {
      console.log('  Failed to get forecast');
    }
  } catch (e) {
    console.log(`  Error: ${e.error}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('VectorAI BASELINE PERFORMANCE BENCHMARK');
  console.log('='.repeat(60));
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Store: ${STORE_ID}`);
  console.log(`SKU: ${SKU_ID}`);
  console.log('='.repeat(60));

  try {
    await benchmarkHealthCheck();
    await benchmarkSingleForecast();
    await benchmarkConcurrentLoad();
    await benchmarkRepeatedRequests();
    await benchmarkMultiSKUForecast();

    console.log('\n' + '='.repeat(60));
    console.log('✅ BASELINE BENCHMARK COMPLETE');
    console.log('='.repeat(60));
    console.log('\nNext Steps:');
    console.log('  1. Record these numbers in BASELINE_BENCHMARK.md');
    console.log('  2. Implement Redis caching layer');
    console.log('  3. Re-run this script to measure improvements');
    console.log('  4. Target: 5-10x faster on repeated requests');
    console.log('\n');
  } catch (e) {
    console.error('Benchmark failed:', e);
  }
}

main();
