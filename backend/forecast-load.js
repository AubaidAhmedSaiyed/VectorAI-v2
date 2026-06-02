import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 30 },
    { duration: '30s', target: 60 },
    { duration: '30s', target: 100 }, // PEAK
    { duration: '30s', target: 60 },
    { duration: '30s', target: 30 },
    { duration: '15s', target: 0 }
  ],

  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05']
  }
};

export default function () {
  const sku = Math.floor(Math.random() * 20) + 1;

  const skuId = `SKU${String(sku).padStart(3, '0')}`;

  const res = http.get(
    `http://localhost:5000/api/ml/forecast/store_1/${skuId}`
  );

  check(res, {
    'status 200': (r) => r.status === 200
  });
}