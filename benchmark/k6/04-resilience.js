// ==============================================================================
// PRUEBA 4 — RESILIENCIA (Tolerancia a fallos e impacto del aislamiento)
// Mide el impacto de una caída parcial del servicio en ambas arquitecturas.
//
// Escenario:
//   - Se inyecta fallo (el contenedor del servicio de reservas se detiene).
//   - El test sigue enviando peticiones y mide cuántas fallan y cómo.
//   - En Microservicios: El catálogo general debería seguir disponible (solo
//     el endpoint de reservas falla → degradación parcial).
//   - En Monolito: Toda la app deja de responder (punto único de fallo).
//
// INSTRUCCIÓN:
//   1. Iniciar este test.
//   2. A los 30 segundos: en otra terminal ejecutar:
//      docker stop tais-ticket-reservation-service  (Microservicios)
//        O
//      docker stop tais-hievents-monolith            (Monolito)
//   3. El test capturará la diferencia en disponibilidad.
//
// UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
// ==============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const catalogFailRate    = new Rate('catalog_fail_rate');
const reservationFailRate = new Rate('reservation_fail_rate');
const catalogOk          = new Counter('catalog_requests_ok');
const reservationOk      = new Counter('reservation_requests_ok');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Fase estable antes del fallo
    { duration: '60s', target: 50 },   // <-- Inyectar fallo manualmente aquí
    { duration: '30s', target: 50 },   // Recuperación o degradación
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    // El catálogo de eventos NO debe fallar en la arquitectura de microservicios
    // (aislamiento de fallos del patrón Strangler Fig)
    'catalog_fail_rate': ['rate<0.50'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8123';
const EVENT_ID = __ENV.EVENT_ID || '00000000-0000-0000-0000-000000000002';

export default function () {
  // Test 1: Disponibilidad del catálogo de eventos (debería sobrevivir en microservicios)
  const catalogRes = http.get(`${BASE_URL}/api/events`, { timeout: '5s' });
  const catalogUp = catalogRes.status === 200 || catalogRes.status === 302;

  if (catalogUp) {
    catalogOk.add(1);
    catalogFailRate.add(0);
  } else {
    catalogFailRate.add(1);
  }

  check(catalogRes, {
    '[Resiliencia] Catálogo de eventos disponible': () => catalogUp,
  });

  sleep(0.3);

  // Test 2: Disponibilidad del módulo de reservas
  const orderPayload = JSON.stringify({
    quantity: 1,
    email: `resiliencia-${__VU}@tais-unsa.edu.pe`,
  });

  const orderRes = http.post(
    `${BASE_URL}/api/events/${EVENT_ID}/orders`,
    orderPayload,
    { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
  );

  const reservationUp = orderRes.status === 201 || orderRes.status === 409;

  if (reservationUp) {
    reservationOk.add(1);
    reservationFailRate.add(0);
  } else {
    reservationFailRate.add(1);
  }

  check(orderRes, {
    '[Resiliencia] Módulo de reservas responde': () => reservationUp,
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const catFail = ((data.metrics?.catalog_fail_rate?.values?.rate ?? 0) * 100).toFixed(1);
  const resFail = ((data.metrics?.reservation_fail_rate?.values?.rate ?? 0) * 100).toFixed(1);

  return {
    stdout: `
=============================================================
  RESULTADO: Prueba de Resiliencia y Tolerancia a Fallos
=============================================================
  Tasa de fallo Catálogo:   ${catFail}%
  Tasa de fallo Reservas:   ${resFail}%
  
  INTERPRETACIÓN:
  - Microservicios: Catálogo ~0%, Reservas ~100% tras inyección de fallo.
    → Degradación PARCIAL (aislamiento exitoso del Bounded Context)
  - Monolito:       Catálogo ~100%, Reservas ~100% tras inyección de fallo.
    → Punto Único de Fallo (impacto total)
=============================================================
`,
  };
}
