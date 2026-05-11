const express = require('express');
const cors = require('cors');
const config = require('./config');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const eventsRouter = require('./routes/events');
app.use('/api', eventsRouter);

app.get('/stations', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>ShopFloorPulse — Stations</title>
  <style>
    body { font-family: sans-serif; background: #f4f4f4; padding: 40px; }
    h1 { color: #FF6B00; }
    .card { background: #fff; border-radius: 8px; padding: 20px; margin: 16px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    .name { font-size: 18px; font-weight: bold; color: #2c2c2c; }
    .label { font-size: 11px; color: #999; text-transform: uppercase; margin-top: 12px; }
    .url { font-family: monospace; font-size: 13px; color: #333; word-break: break-all; }
    a { color: #FF6B00; }
  </style>
</head>
<body>
  <h1>ShopFloorPulse — Stations</h1>
  ${config.machines.map(m => `
  <div class="card">
    <div class="name">${m.name}</div>
    <div class="label">Dashboard URL</div>
    <div class="url"><a href="${base}/?machine=${m.id}" target="_blank">${base}/?machine=${m.id}</a></div>
    <div class="label">Arduino POST URL</div>
    <div class="url">${base}/api/event</div>
    <div class="label">Machine ID</div>
    <div class="url">${m.id}</div>
  </div>`).join('')}
</body>
</html>`;
  res.send(html);
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ShopFloorPulse running on port ${PORT}`));