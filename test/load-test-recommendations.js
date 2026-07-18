import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const ErrorRate = new Rate('errors');
const RedisUnavailable = new Counter('redis_unavailable');

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp up to 100 users (Cold Cache)
    { duration: '1m', target: 500 },   // Ramp up to 500 users (Warm Cache)
    { duration: '1m', target: 1000 },  // Ramp up to 1000 users (Stress)
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests must complete below 500ms
    errors: ['rate<0.05'], // Error rate must be less than 5%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/v1';

export default function () {
  // Simulate a user browsing the homepage
  const homepageRes = http.get(`${BASE_URL}/recommendations/homepage?userId=user-${__VU}&lat=40.7128&lng=-74.0060`);
  
  check(homepageRes, {
    'Homepage status is 200': (r) => r.status === 200,
    'Homepage has metadata': (r) => r.json('metadata') !== undefined,
  }) || ErrorRate.add(1);

  // Simulate a user visiting a PDP
  const productId = `prod-${Math.floor(Math.random() * 1000)}`;
  const pdpRes = http.get(`${BASE_URL}/recommendations/products/${productId}?userId=user-${__VU}`);
  
  check(pdpRes, {
    'PDP status is 200': (r) => r.status === 200,
    'PDP returns items': (r) => Array.isArray(r.json()),
  }) || ErrorRate.add(1);

  sleep(Math.random() * 2 + 1); // Think time between 1-3 seconds
}
