const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const pool = require('../db/pool');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/images/'),
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const upload = multer({ storage });

// SSE clients
let clients = [];

// SSE endpoint
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const client = { res };
  clients.push(client);
  req.on('close', () => {
    clients = clients.filter(c => c !== client);
  });
});

function pushUpdate(data) {
  clients.forEach(c => {
    c.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Arduino posts machine status here
router.post('/event', async (req, res) => {
  const { machine_id, status } = req.body;
  try {
    await pool.query(
      'INSERT INTO machine_events (machine_id, status) VALUES ($1, $2)',
      [machine_id, status]
    );
    pushUpdate({ machine_id, status, timestamp: new Date() });
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

// ── DOWNTIME START (broadcast to Live Floor) ──────────────────────────────────
router.post('/downtime-start', (req, res) => {
  const { machine_id, reason, start } = req.body;
  pushUpdate({ machine_id, type: 'downtime_start', reason, start });
  res.json({ ok: true });
});

// ── DOWNTIME END (broadcast to Live Floor) ────────────────────────────────────
router.post('/downtime-end', (req, res) => {
  const { machine_id, duration } = req.body;
  pushUpdate({ machine_id, type: 'downtime_end', duration });
  res.json({ ok: true });
});

// ── GET ALL MACHINES EVENTS (today) ───────────────────────────────────────────
router.get('/events-all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         e.id,
         e.machine_id,
         e.status,
         e.reason,
         e.timestamp,
         CASE
           WHEN e.status = 'OFF' THEN
             LEAST(
               EXTRACT(EPOCH FROM (
                 LEAD(e.timestamp) OVER (PARTITION BY e.machine_id ORDER BY e.timestamp)
                 - e.timestamp
               )),
               14400
             )
           ELSE NULL
         END AS duration_seconds
       FROM machine_events e
       WHERE e.timestamp > DATE_TRUNC('day', NOW())
       ORDER BY e.timestamp DESC`
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

// Log reason for stop
router.post('/reason', async (req, res) => {
  const { machine_id, reason } = req.body;
  try {
    await pool.query(
      `UPDATE machine_events 
       SET reason = $1 
       WHERE id = (
         SELECT id FROM machine_events
         WHERE machine_id = $2
         AND status = 'OFF'
         AND reason IS NULL
         ORDER BY timestamp DESC
         LIMIT 1
       )`,
      [reason, machine_id]
    );
    pushUpdate({ machine_id, status: 'reason_updated', reason, timestamp: new Date() });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Save config
router.post('/config', async (req, res) => {
  const configPath = path.join(__dirname, '../config.js');
  const cfg = req.body;
  const content = `module.exports = ${JSON.stringify(cfg, null, 2)};`;
  try {
    fs.writeFileSync(configPath, content);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save config' });
  }
});

// Logo upload
router.post('/upload-logo', upload.single('logo'), async (req, res) => {
  try {
    const logoPath = 'images/' + req.file.filename;
    const config = require('../config');
    config.company.logo = logoPath;
    const configPath = path.join(__dirname, '../config.js');
    fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(config, null, 2)};`);
    res.json({ ok: true, logo: logoPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
