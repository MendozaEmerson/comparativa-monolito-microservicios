import fastify from 'fastify';
import { pool, initDatabase } from './database';
import crypto from 'crypto';

const app = fastify({
  logger: process.env.NODE_ENV !== 'production',
  disableRequestLogging: process.env.NODE_ENV === 'production',
});

const PORT = parseInt(process.env.PORT || '3001', 10);

// Endpoint de Salud y Telemetría
app.get('/health', async () => {
  return {
    status: 'healthy',
    service: 'ticket-reservation-service',
    pattern: 'Strangler Fig Application',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// Consulta de aforo en tiempo real para un evento
app.get('/api/events/:event_id', async (request, reply) => {
  const { event_id } = request.params as { event_id: string };

  const result = await pool.query(
    'SELECT id, name, total_capacity, available_tickets FROM events WHERE id = $1',
    [event_id]
  );

  if (result.rows.length === 0) {
    return reply.status(404).send({ error: 'EVENT_NOT_FOUND', message: 'Evento no encontrado' });
  }

  return reply.send(result.rows[0]);
});

// Interceptor de órdenes de Hi.Events (POST /api/events/:event_id/orders)
// y compatibilidad con reservas estándar (POST /api/reservations)
const handleOrderCreation = async (request: any, reply: any) => {
  const event_id = request.params?.event_id || request.body?.event_id || '00000000-0000-0000-0000-000000000001';
  const quantity = parseInt(request.body?.quantity || request.body?.ticket_quantity || '1', 10);
  const email = request.body?.email || request.body?.customer_email || 'attendee@benchmark.unsa.edu.pe';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Control de concurrencia pesimista (SELECT ... FOR UPDATE)
    // Garantiza 0% de sobreventa bajo ráfagas masivas de peticiones concurrentes
    const eventRes = await client.query(
      'SELECT id, available_tickets FROM events WHERE id = $1 FOR UPDATE',
      [event_id]
    );

    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        error: 'EVENT_NOT_FOUND',
        message: `El evento ${event_id} no existe en el catálogo de reservas.`,
      });
    }

    const available = eventRes.rows[0].available_tickets;

    if (available < quantity) {
      await client.query('ROLLBACK');
      return reply.status(409).send({
        error: 'INSUFFICIENT_SEATS',
        message: 'No hay suficientes entradas disponibles.',
        requested: quantity,
        available: available,
      });
    }

    // Decrementar inventario e insertar orden
    await client.query(
      'UPDATE events SET available_tickets = available_tickets - $1 WHERE id = $2',
      [quantity, event_id]
    );

    const order_id = `ord-${crypto.randomUUID()}`;
    await client.query(
      'INSERT INTO orders (id, event_id, customer_email, ticket_quantity) VALUES ($1, $2, $3, $4)',
      [order_id, event_id, email, quantity]
    );

    await client.query('COMMIT');

    return reply.status(201).send({
      id: order_id,
      event_id: event_id,
      ticket_quantity: quantity,
      status: 'CONFIRMED',
      customer_email: email,
      created_at: new Date().toISOString(),
      architecture: 'microservice-strangler-fig',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    app.log.error(err);
    return reply.status(500).send({
      error: 'INTERNAL_TRANSACTION_ERROR',
      message: 'Fallo al procesar la reserva concurrente en base de datos.',
    });
  } finally {
    client.release();
  }
};

// Registrar rutas estranguladas
app.post('/api/events/:event_id/orders', handleOrderCreation);
app.post('/api/reservations', handleOrderCreation);

// Inicio del servidor
const start = async () => {
  try {
    await initDatabase();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Microservicio] Ticket Reservation Service escuchando en http://0.0.0.0:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

