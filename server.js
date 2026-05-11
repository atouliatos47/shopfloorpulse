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

// HUB — lists all stations
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ShopFloorPulse — Hub</title>
  <link href="https://fonts.googleapis.com/css2?family=Russo+One&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #f4f4f4; }
    header { background: #FF6B00; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    #app-name { font-family: 'Russo One', sans-serif; font-size: 22px; letter-spacing: 2px; color: #2c2c2c; }
    #app-name .h { color: #1a6fd4; }
    main { max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 20px; }
    .card { background: #fff; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .station-name { font-size: 18px; font-weight: bold; color: #2c2c2c; margin-bottom: 12px; }
    .label { font-size: 11px; color: #999; text-transform: uppercase; margin-top: 10px; margin-bottom: 4px; }
    .url { font-family: monospace; font-size: 13px; color: #333; word-break: break-all; }
    .url a { color: #FF6B00; text-decoration: none; }
    .url a:hover { text-decoration: underline; }
    .btn { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #FF6B00; color: #fff; border-radius: 6px; font-weight: bold; text-decoration: none; font-size: 14px; cursor: pointer; border: none; }
    .btn:hover { background: #e05e00; }
    .add-form { background: #fff; border-radius: 10px; padding: 24px; margin-top: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .add-form h2 { margin-bottom: 16px; }
    input { width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 12px; }
    .hint { font-size: 11px; color: #aaa; margin-top: -8px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <header>
    <span id="app-name"><span class="h">S</span>hop<span class="h">F</span>loor<span class="h">P</span>ulse</span>
    <span style="font-size:13px;color:#2c2c2c;font-weight:bold;">HUB</span>
  </header>
  <main>
    <h2>Stations</h2>
    ${config.machines.map(m => `
    <div class="card">
      <div class="station-name">${m.name}</div>
      <div class="label">Dashboard URL</div>
      <div class="url"><a href="${base}/station/${m.id}" target="_blank">${base}/station/${m.id}</a></div>
      <div class="label">Arduino POST URL</div>
      <div class="url">${base}/api/event</div>
      <div class="label">Machine ID (use in Arduino sketch)</div>
      <div class="url">${m.id}</div>
      <a class="btn" href="${base}/station/${m.id}" target="_blank">Open Dashboard</a>
    </div>`).join('')}

    <div class="add-form">
      <h2>Add New Station</h2>
      <input id="s-name" type="text" placeholder="Station name (e.g. Press 1)">
      <input id="s-id" type="text" placeholder="Station ID (e.g. press-1, no spaces)">
      <div class="hint">ID must be lowercase with dashes, no spaces</div>
      <button class="btn" onclick="addStation()">Add Station</button>
      <div id="add-result" style="margin-top:12px;font-size:13px;color:green;"></div>
    </div>
  </main>
  <script>
    function addStation() {
      const name = document.getElementById('s-name').value.trim();
      const id = document.getElementById('s-id').value.trim().toLowerCase().replace(/\\s+/g, '-');
      if (!name || !id) return alert('Please fill in both fields');
      fetch('/api/add-station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, id })
      })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          document.getElementById('add-result').textContent = 'Station added! Reloading...';
          setTimeout(() => location.reload(), 1500);
        } else {
          alert('Error: ' + data.error);
        }
      });
    }
  </script>
</body>
</html>`;
  res.send(html);
});

// ADD STATION — writes to config.js
app.post('/api/add-station', (req, res) => {
  const { name, id } = req.body;
  if (!name || !id) return res.json({ error: 'Missing name or id' });
  if (config.machines.find(m => m.id === id)) return res.json({ error: 'ID already exists' });
  config.machines.push({ id, name, location: 'Shop Floor' });
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'config.js');
  fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(config, null, 2)};`);
  res.json({ ok: true });
});

// STATION DASHBOARD
app.get('/station/:machine_id', (req, res) => {
  res.sendFile(__dirname + '/public/station.html');
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ShopFloorPulse running on port ${PORT}`));