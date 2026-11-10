// ==============================================================================
// PRUEBA 2 — LOAD TEST (Carga Escalonada — Rampa de Usuarios Virtuales)
// Mide latencia p50/p90/p95/p99 y tasa de errores bajo carga sostenida
// UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
//
// INSTRUCCIÓN DE USO:
//   Para Monolito:     k6 run --env BASE_URL=http://localhost:8123 02-load-test.js
//   Para Microservicios: k6 run --env BASE_URL=http://localhost:8123 02-load-test.js
//   (El Gateway enruta transparentemente al microservicio en Tratamiento B)
// ==============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Métricas personalizadas para el análisis comparativo
const orderLatency   = new Trend('order_creation_latency_ms', true);
const orderFailRate  = new Rate('order_fail_rate');
const ordersCreated  = new Counter('orders_created_total');

export const options = {
  // Rampa escalonada: 20 → 100 → 200 → 500 VUs (similar a evento de alta demanda)
  stages: [
    { duration: '30s', target: 20  },   // Fase calentamiento
    { duration: '1m',  target: 100 },   // Carga media
    { duration: '1m',  target: 200 },   // Carga alta
    { duration: '2m',  target: 500 },   // Pico de alta demanda
    { duration: '30s', target: 0   },   // Enfriamiento
  ],
  thresholds: {
    // Criterios de aprobación del experimento
    'order_creation_latency_ms': ['p(95)<2000', 'p(99)<3500'],
    'order_fail_rate':           ['rate<0.05'],   // Menos del 5% de errores técnicos
    'http_req_failed':           ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8123';
const EVENT_ID = __ENV.EVENT_ID || '00000000-0000-0000-0000-000000000002';

export default function () {
  const payload = JSON.stringify({
    quantity: 1,
    email: `user-${__VU}-${__ITER}@tais-unsa.edu.pe`,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  };

  const res = http.post(`${BASE_URL}/api/events/${EVENT_ID}/orders`, payload, params);

  // Registrar latencia
  orderLatency.add(res.timings.duration);

  const success = check(res, {
    'Reserva procesada (201 Creado)':       (r) => r.status === 201,
    'Sin cupos disponibles (409 Conflict)': (r) => r.status === 409,
    'Sin errores 5xx del servidor':         (r) => r.status < 500,
  });

  if (res.status === 201) {
    ordersCreated.add(1);
  }

  // Error técnico (distinto a 409 de negocio)
  if (res.status >= 500 || res.status === 0) {
    orderFailRate.add(1);
  } else {
    orderFailRate.add(0);
  }

  sleep(0.1 + Math.random() * 0.5);
}
