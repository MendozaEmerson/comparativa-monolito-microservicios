// ==============================================================================
// PRUEBA 3 — STRESS TEST DE CONTENCIÓN (Anti-Overbooking / 0% Sobreventa)
// 500 usuarios compiten simultáneamente por exactamente 20 cupos disponibles.
// Hipótesis: Ambas arquitecturas deben garantizar exactamente 20 órdenes OK (HTTP 201)
//            y 480 rechazos por aforo agotado (HTTP 409). Cero errores 5xx.
// UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
// ==============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const confirmed  = new Counter('reservas_confirmadas_201');
const rejected   = new Counter('reservas_rechazadas_409');
const serverErr  = new Counter('errores_servidor_5xx');
const overbooking = new Rate('overbooking_rate');

export const options = {
  // Ráfaga: todos los VUs arriban al mismo tiempo para maximizar la contención
  scenarios: {
    contencion_alta: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      startTime: '0s',
    },
  },
  thresholds: {
    // La prueba FALLA si hay cualquier error de servidor (overbooking sería catastrófico)
    'errores_servidor_5xx': ['count==0'],
    'http_req_failed':      ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8123';
// Evento con exactamente 20 cupos — Semilla en base de datos al levantar el servicio
const EVENT_ID = __ENV.EVENT_ID || '00000000-0000-0000-0000-000000000001';

export default function () {
  const payload = JSON.stringify({
    quantity: 1,
    email: `vu-${__VU}@contencion-tais.edu.pe`,
  });

  const res = http.post(
    `${BASE_URL}/api/events/${EVENT_ID}/orders`,
    payload,
    { headers: { 'Content-Type': 'application/json' }, timeout: '15s' }
  );

  if (res.status === 201) {
    confirmed.add(1);
    overbooking.add(0);
  } else if (res.status === 409) {
    rejected.add(1);
    overbooking.add(0);
  } else {
    serverErr.add(1);
    overbooking.add(1);
  }

  check(res, {
    'Respuesta determinista (201 o 409)': (r) => r.status === 201 || r.status === 409,
    'Sin errores técnicos del servidor':  (r) => r.status < 500 && r.status !== 0,
  });

  sleep(0.05);
}

export function handleSummary(data) {
  return {
    stdout: `
=============================================================
  RESULTADO: Prueba de Contención / Anti-Overbooking
=============================================================
  Reservas Confirmadas (HTTP 201): ${data.metrics?.reservas_confirmadas_201?.values?.count ?? 'N/A'}
  Rechazadas por Aforo (HTTP 409): ${data.metrics?.reservas_rechazadas_409?.values?.count ?? 'N/A'}
  Errores de Servidor  (HTTP 5xx): ${data.metrics?.errores_servidor_5xx?.values?.count ?? 'N/A'}
  Latencia p95: ${data.metrics?.http_req_duration?.values?.['p(95)']?.toFixed(2) ?? 'N/A'} ms
=============================================================
  HIPÓTESIS VALIDADA si: Confirmadas ≤ 20 y Errores 5xx = 0
=============================================================
`,
  };
}
