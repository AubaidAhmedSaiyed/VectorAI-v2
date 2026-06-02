const http = require('http');
const https = require('https');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// 20 SKUs
const SKUS = [
  'SKU001','SKU002','SKU003','SKU004','SKU005',
  'SKU006','SKU007','SKU008','SKU009','SKU010',
  'SKU011','SKU012','SKU013','SKU014','SKU015',
  'SKU016','SKU017','SKU018','SKU019','SKU020'
];

const STORE_ID = 'store_1';

// ─────────────────────────────
// HTTP REQUEST
// ─────────────────────────────
function makeRequest(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;

    lib.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          time: Date.now() - start,
          success: res.statusCode < 400
        });
      });
    }).on('error', (err) => {
      resolve({
        status: 500,
        time: Date.now() - start,
        success: false,
        error: err.message
      });
    });
  });
}

// ─────────────────────────────
// SAFE STATS
// ─────────────────────────────
function stats(arr) {
  if (!arr.length) return { avg: 0, p95: 0, max: 0 };

  arr.sort((a,b)=>a-b);

  const avg = Math.round(arr.reduce((a,b)=>a+b)/arr.length);
  const p95 = arr[Math.floor(arr.length * 0.95)];
  const max = arr[arr.length - 1];

  return { avg, p95, max };
}

// ─────────────────────────────
// TEST 1: SINGLE FORECAST
// ─────────────────────────────
async function singleTest() {
  console.log('\nTEST 1: Single Forecast');

  const sku = 'SKU001';
  const url = `${BACKEND_URL}/api/ml/forecast/${STORE_ID}/${sku}`;

  const times = [];

  for (let i = 0; i < 5; i++) {
    const r = await makeRequest(url);
    console.log(`Request ${i+1}: ${r.time}ms ${r.success ? '✓' : '✗'}`);

    if (r.success) times.push(r.time);
  }

  console.log('Stats:', stats(times));
}

// ─────────────────────────────
// TEST 2: RANDOM LOAD (20 SKUs)
// ─────────────────────────────
async function loadTest() {
  console.log('\nTEST 2: Load Test (Random SKUs)');

  const results = [];

  const requests = 50;

  for (let i = 0; i < requests; i++) {
    const sku = SKUS[Math.floor(Math.random() * SKUS.length)];
    const url = `${BACKEND_URL}/api/ml/forecast/${STORE_ID}/${sku}`;

    const r = await makeRequest(url);

    process.stdout.write(`\rProgress: ${i+1}/${requests}`);

    if (r.success) results.push(r.time);
  }

  console.log('\n');
  console.log('Load Stats:', stats(results));
}

// ─────────────────────────────
// TEST 3: MULTI-SKU ENDPOINT
// ─────────────────────────────
async function multiSkuTest() {
  console.log('\nTEST 3: Multi SKU Forecast');

  const url = `${BACKEND_URL}/api/ml/forecast/${STORE_ID}`;

  const r = await makeRequest(url);

  console.log('Status:', r.status);
  console.log('Time:', r.time + 'ms');
  console.log('Success:', r.success);
}

// ─────────────────────────────
// TEST 4: HEALTH
// ─────────────────────────────
async function health() {
  console.log('\nTEST 4: Health');

  const r = await makeRequest(`${BACKEND_URL}/api/ml/health`);

  console.log('Health:', r.time + 'ms');
}

// ─────────────────────────────
// MAIN
// ─────────────────────────────
async function main() {
  console.log('\n==============================');
  console.log('VECTOR AI BENCHMARK v2');
  console.log('==============================');

  await health();
  await singleTest();
  await loadTest();
  await multiSkuTest();

  console.log('\nDONE');
}

main();