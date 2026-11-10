// ==============================================================================
// PRUEBA 1 — SMOKE TEST (Verificación de salud antes del experimento)
// Verifica que ambos tratamientos respondan correctamente antes de las pruebas
// UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
// ==============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8123';
const EVENT_ID = __ENV.EVENT_ID || '00000000-0000-0000-0000-000000000001';

export default function () {
  // Verificar que el catálogo de eventos responde (aplica a ambos tratamientos)
  const catalogRes = http.get(`${BASE_URL}/api/events`);
  check(catalogRes, {
    '[Smoke] Catálogo de eventos responde 200': (r) => r.status === 200 || r.status === 302,
  });

  sleep(1);

  // Verificar que el endpoint de reservas acepta peticiones
  const orderPayload = JSON.stringify({
    quantity: 1,
    email: 'smoke-test@tais-unsa.edu.pe',
  });

  const orderRes = http.post(
    `${BASE_URL}/api/events/${EVENT_ID}/orders`,
    orderPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(orderRes, {
    '[Smoke] Endpoint de reservas acepta petición': (r) =>
      r.status === 201 || r.status === 409 || r.status === 404,
  });

  sleep(1);
}
