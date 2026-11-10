# Evaluación Comparativa de Arquitecturas sobre Hi.Events
## Monolito Modular vs. Microservicios (Patrón Strangler Fig)
### UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software — Hito 2

---

## ¿Qué contiene este repositorio?

Este repositorio **NO contiene el código fuente de Hi.Events**. En cambio, contiene el **entorno completo del experimento** de ingeniería de software diseñado para evaluar el impacto en rendimiento y consumo de recursos entre dos arquitecturas aplicadas sobre la plataforma real [Hi.Events](https://github.com/HiEventsDev/Hi.Events).

La aplicación Hi.Events se descarga y ejecuta automáticamente mediante su **imagen oficial de Docker Hub** (`daveearley/hi.events-all-in-one`).

---

## Arquitectura del Experimento

```
┌──────────────────────────────────────────────────────────────────┐
│  TRATAMIENTO A: Monolito Modular (Línea Base)                    │
│                                                                  │
│  Grafana k6 ──▶ [ Hi.Events Monolito (Laravel + React) ]        │
│                   └── PostgreSQL + Redis                         │
│  Cuota: 2 CPUs / 2 GB RAM (límites fijos en docker-compose)     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  TRATAMIENTO B: Microservicios — Patrón Strangler Fig            │
│                                                                  │
│              ┌──────────────────────────────┐                   │
│  Grafana k6 ─▶ API Gateway (Nginx)           │                   │
│              └────┬─────────────────────────┘                   │
│                   │  /api/events/*  ──▶ [ Hi.Events Core ]       │
│                   │                       └── PostgreSQL Core    │
│                   │                                              │
│                   │  /api/events/{id}/orders ──▶                 │
│                   │       [ ticket-reservation-service ]         │
│                   │          (Node.js + Fastify + TypeScript)     │
│                   │          └── PostgreSQL Reservaciones         │
│                                                                  │
│  Cuota: 2 CPUs / 2 GB RAM (mismos límites totales)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Requisitos Previos

| Herramienta | Versión mínima | Verificar con |
|:---|:---|:---|
| Docker Desktop | 24+ | `docker --version` |
| Docker Compose | V2 integrado | `docker compose version` |
| Grafana k6 | 0.50+ | `k6 version` |
| Node.js | 20 LTS | `node --version` |
| Git | Cualquiera | `git --version` |

> **Windows:** Asegúrate de que Docker Desktop está en ejecución antes de continuar.

---

## Inicio Rápido (5 pasos)

### Paso 1 — Clonar este repositorio
```powershell
git clone https://github.com/TU_USUARIO/evaluacion-arquitecturas-hievents.git
cd evaluacion-arquitecturas-hievents
```

### Paso 2 — Preparar variables de entorno
```powershell
Copy-Item .env.example .env
# Edita .env si deseas cambiar contraseñas o puertos
```

### Paso 3A — Levantar el Monolito (Tratamiento A)
```powershell
docker compose -f docker-compose.monolith.yml up -d

# Esperar ~30 segundos y abrir el navegador en:
# http://localhost:8123/auth/register
```

### Paso 3B — Levantar los Microservicios (Tratamiento B)
```powershell
# Primero detén el monolito si está corriendo
docker compose -f docker-compose.monolith.yml down

docker compose -f docker-compose.microservices.yml up -d --build

# Mismo puerto: http://localhost:8123
# El Gateway redirige /api/events/{id}/orders → Microservicio de Reservas
```

### Paso 4 — Ejecutar el experimento completo
```powershell
# Ejecuta todos los tests k6 automáticamente para ambos tratamientos
.\benchmark\scripts\run-experiment.ps1 -Tratamiento both -Prueba all
```

### Paso 5 — Recolectar métricas de Docker (en paralelo con el experimento)
```powershell
# En una terminal separada, mientras corre run-experiment.ps1:
.\benchmark\scripts\collect-docker-stats.ps1 -Tratamiento monolith -DuracionSegundos 150
```

---

## Pruebas de Carga (k6)

| Script | Propósito | Duración aprox. |
|:---|:---|:---|
| `01-smoke-test.js` | Verificar que ambos tratamientos responden correctamente | 30 s |
| `02-load-test.js` | Rampa de 20 → 500 usuarios virtuales (carga escalonada) | ~5 min |
| `03-stress-contention.js` | 500 VUs compitiendo por 20 cupos (anti-overbooking) | 30 s |
| `04-resilience.js` | Tolerancia a fallos: impacto de caída parcial del servicio | ~2 min |

**Ejecutar una prueba individual:**
```powershell
k6 run --env BASE_URL=http://localhost:8123 .\benchmark\k6\03-stress-contention.js
```

---

## Estructura del Repositorio

```
evaluacion-arquitecturas-hievents/
├── .env.example                              Variables de entorno
├── docker-compose.monolith.yml               Tratamiento A: Monolito
├── docker-compose.microservices.yml          Tratamiento B: Microservicios + Gateway
│
├── gateway/
│   └── nginx.conf                            Configuración del API Gateway (Strangler Fig)
│
├── services/
│   └── ticket-reservation-service/           Microservicio extraído (TypeScript/Fastify)
│       ├── src/
│       │   ├── index.ts                      Servidor principal + endpoints
│       │   └── database.ts                   Esquema PostgreSQL + pool de conexiones
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
└── benchmark/
    ├── k6/                                   Pruebas de carga Grafana k6
    │   ├── 01-smoke-test.js
    │   ├── 02-load-test.js
    │   ├── 03-stress-contention.js
    │   └── 04-resilience.js
    ├── scripts/
    │   ├── run-experiment.ps1                Script maestro del experimento
    │   └── collect-docker-stats.ps1          Recolección de CPU/RAM (CSV)
    └── results/                              Resultados generados (ignorados por Git)
```

---

## Patrón Arquitectónico: Strangler Fig

> *"En lugar de una reescritura masiva ('Big Bang'), el patrón Strangler Fig intercepta selectivamente los módulos de mayor criticidad y los extrae hacia servicios independientes, manteniendo la aplicación original operativa."*
> — Martin Fowler (2004), Sam Newman (2021, *Monolith to Microservices*)

En este experimento, el Bounded Context extraído es el **motor de reserva de tickets**, seleccionado por:
- **Alta contención concurrente:** Múltiples usuarios compitiendo simultáneamente por aforo limitado.
- **Criticidad de consistencia:** Requiere transacciones atómicas (0% de sobreventa).
- **Independencia de despliegue:** Puede escalarse horizontalmente sin afectar el catálogo.

---

## Equipo y Contexto Académico

- **Universidad:** Universidad Nacional de San Agustín (UNSA) - EPIS
- **Curso:** Tópicos Avanzados en Ingeniería de Software
- **Hito:** 2 — Evaluación de rendimiento y consumo de recursos
- **Aplicación de estudio:** [Hi.Events](https://github.com/HiEventsDev/Hi.Events) (Licencia AGPL-3.0)
