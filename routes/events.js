const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Arduino posts machine status here
router.post('/event', async (req, res) => {
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
router.get('/events/:machine_id', async (req, res) => {
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
router.get('/status/:machine_id', async (req, res) => {
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

module.exports = router;