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

// ── HEARTBEAT ─────────────────────────────────────────────────────────────────
const heartbeats = {}; // { machine_id: timestamp }

app.post('/api/heartbeat', (req, res) => {
  const { machine_id } = req.body;
  if (!machine_id) return res.json({ error: 'Missing machine_id' });
  heartbeats[machine_id] = new Date().toISOString();
  res.json({ ok: true });
});

app.get('/api/heartbeat/:machine_id', (req, res) => {
  const ts = heartbeats[req.params.machine_id] || null;
  res.json({ machine_id: req.params.machine_id, last_seen: ts });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ShopFloorPulse running on port ${PORT}`));
