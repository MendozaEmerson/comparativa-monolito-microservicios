import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'hievents_reservations',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'changeme_benchmark',
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        total_capacity INT NOT NULL,
        available_tickets INT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) REFERENCES events(id),
        customer_email VARCHAR(255) NOT NULL,
        ticket_quantity INT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Índice para optimizar consultas de aforo por evento
      CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
    `);

    // Semilla para pruebas de contención concurrente k6 (20 cupos de alta demanda)
    await client.query(`
      INSERT INTO events (id, name, total_capacity, available_tickets)
      VALUES 
        ('00000000-0000-0000-0000-000000000001', 'Concierto VIP Hi.Events (Alta Concurrencia)', 20, 20),
        ('00000000-0000-0000-0000-000000000002', 'Conferencia TAIS 2026', 500, 500)
      ON CONFLICT (id) DO UPDATE 
      SET available_tickets = EXCLUDED.total_capacity;
    `);

    console.log('[DB] Base de datos de reservas inicializada y semillas sincronizadas.');
  } catch (err) {
    console.error('[DB Error] Falla al inicializar esquema de reservas:', err);
    throw err;
  } finally {
    client.release();
  }
}

