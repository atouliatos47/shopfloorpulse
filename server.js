const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Arduino posts machine status here
app.post('/api/event', async (req, res) => {
  const { machine_id, status } = req.body;
  try {
    await pool.query(
      'INSERT INTO machine_events (machine_id, status) VALUES ($1, $2)',
      [machine_id, status]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get today's events for a machine
app.get('/api/events/:machine_id', async (req, res) => {
  const { machine_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM machine_events 
       WHERE machine_id = $1 
       AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC`,
      [machine_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get live status for a machine
app.get('/api/status/:machine_id', async (req, res) => {
  const { machine_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT status, timestamp FROM machine_events 
       WHERE machine_id = $1 
       ORDER BY timestamp DESC LIMIT 1`,
      [machine_id]
    );
    res.json(result.rows[0] || { status: 'unknown' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClamClamp running on port ${PORT}`));