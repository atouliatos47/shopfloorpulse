const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const eventsRouter = require('./routes/events');
app.use('/api', eventsRouter);

// ── NEON DATABASE ─────────────────────────────────────────────────────────────
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create heartbeats table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS heartbeats (
    machine_id TEXT PRIMARY KEY,
    last_seen  TIMESTAMPTZ NOT NULL
  )
`).then(() => console.log('Heartbeats table ready'))
  .catch(err => console.error('DB init error:', err));

// ── HEARTBEAT ─────────────────────────────────────────────────────────────────
app.post('/api/heartbeat', async (req, res) => {
  const { machine_id } = req.body;
  if (!machine_id) return res.json({ error: 'Missing machine_id' });
  try {
    await pool.query(`
      INSERT INTO heartbeats (machine_id, last_seen)
      VALUES ($1, NOW())
      ON CONFLICT (machine_id) DO UPDATE SET last_seen = NOW()
    `, [machine_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Heartbeat save error:', err);
    res.json({ error: 'DB error' });
  }
});

app.get('/api/heartbeat/:machine_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT last_seen FROM heartbeats WHERE machine_id = $1',
      [req.params.machine_id]
    );
    const last_seen = result.rows.length ? result.rows[0].last_seen : null;
    res.json({ machine_id: req.params.machine_id, last_seen });
  } catch (err) {
    console.error('Heartbeat fetch error:', err);
    res.json({ machine_id: req.params.machine_id, last_seen: null });
  }
});

// ── GET CONFIG ────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json(config);
});

// ── ADD MACHINE ───────────────────────────────────────────────────────────────
app.post('/api/add-station', (req, res) => {
  const { name, id } = req.body;
  if (!name || !id) return res.json({ error: 'Missing name or id' });
  if (config.machines.find(m => m.id === id)) return res.json({ error: 'ID already exists' });

  config.machines.push({ id, name, location: 'Shop Floor' });
  saveConfig();
  res.json({ ok: true });
});

// ── EDIT MACHINE ──────────────────────────────────────────────────────────────
app.put('/api/machine/:id', (req, res) => {
  const { id } = req.params;
  const { name, id: newId } = req.body;
  const machine = config.machines.find(m => m.id === id);
  if (!machine) return res.json({ error: 'Machine not found' });
  if (newId !== id && config.machines.find(m => m.id === newId)) return res.json({ error: 'ID already exists' });
  machine.name = name;
  machine.id   = newId;
  saveConfig();
  res.json({ ok: true });
});

// ── DELETE MACHINE ────────────────────────────────────────────────────────────
app.delete('/api/machine/:id', (req, res) => {
  const { id } = req.params;
  const index = config.machines.findIndex(m => m.id === id);
  if (index === -1) return res.json({ error: 'Machine not found' });

  config.machines.splice(index, 1);
  saveConfig();
  res.json({ ok: true });
});

// ── STATION PAGE ──────────────────────────────────────────────────────────────
app.get('/station/:machine_id', (req, res) => {
  res.sendFile(__dirname + '/public/station.html');
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
function saveConfig() {
  const configPath = path.join(__dirname, 'config.js');
  fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(config, null, 2)};`);
}

const os = require('os');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }
  console.log(`ShopFloorPulse running on port ${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
});
