// ── COG SVG ───────────────────────────────────────────────────────────────────
function renderCog(sizeClass) {
  const teeth = 8, cx = 50, cy = 50;
  const inner = sizeClass === 'large' ? 16 : 14;
  const outer = sizeClass === 'large' ? 26 : 22;
  const hole  = sizeClass === 'large' ? 8  : 7;
  const step  = (2 * Math.PI) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step * 0.35;
    const a2 = a0 + step * 0.5;
    const a3 = a0 + step * 0.65;
    const a4 = a0 + step;
    const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    d += (i === 0 ? `M ` : `L `) + p(inner, a0) + ` `;
    d += `L ${p(outer, a1)} L ${p(outer, a2)} L ${p(outer, a3)} L ${p(inner, a4)} `;
  }
  d += 'Z';
  return `<svg class="cog-${sizeClass}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path class="cog-svg" d="${d}"/>
    <circle cx="${cx}" cy="${cy}" r="${hole}" fill="white"/>
  </svg>`;
}

// ── BUILD CARD ────────────────────────────────────────────────────────────────
function buildCard(machine) {
  const card = document.createElement('div');
  card.className = 'machine-card unknown';
  card.id = `card-${machine.id}`;
  card.innerHTML = `
    <div class="conn-badge no-signal" id="conn-${machine.id}">
      <div class="conn-dot"></div><span>No Signal</span>
    </div>
    <div class="card-machine-name">${machine.name}</div>
    <div class="cog-wrapper">${renderCog('large')}${renderCog('small')}</div>
    <div class="card-status">--</div>
    <div class="card-downtime" id="dt-${machine.id}" style="display:none">
      <div class="card-reason" id="dt-reason-${machine.id}"></div>
      <div class="card-counter" id="dt-counter-${machine.id}">00:00:00</div>
    </div>
  `;
  return card;
}

// Track machines that went OFF without a reason logged yet
const pendingReason = {};

// ── UPDATE CARD STATUS ────────────────────────────────────────────────────────
function setCardStatus(machineId, status) {
  const card = document.getElementById(`card-${machineId}`);
  if (!card) return;
  const s = status?.toLowerCase() || 'unknown';

  // If machine went ON but still has a pending unlogged stop — keep it OFF
  if (s === 'on' && pendingReason[machineId]) return;

  card.className = `machine-card ${s}`;
  if (!cardDowntimes[machineId]) {
    card.querySelector('.card-status').textContent = status?.toUpperCase() || '--';
  }
}

// ── MACHINES DATA ─────────────────────────────────────────────────────────────
let MACHINES = [];

// Track active downtime per machine { machineId: { timer, start } }
const cardDowntimes = {};

// ── INIT ──────────────────────────────────────────────────────────────────────
function initDashboard(machines) {
  MACHINES = machines;
  const grid    = document.getElementById('machine-grid');
  const counter = document.getElementById('machine-count');
  grid.innerHTML = '';

  if (counter) {
    counter.textContent = machines.length + ' machine' + (machines.length !== 1 ? 's' : '');
  }

  if (!machines || machines.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="big">⚙️</div>
        No machines added yet.<br>Go to <strong>Machines</strong> to add one.
      </div>`;
    return;
  }

  machines.forEach(m => {
    grid.appendChild(buildCard(m));
    fetchMachineStatus(m.id);
    startHeartbeatPolling(m.id);
  });

  connectSSE();
}

// ── FETCH STATUS ──────────────────────────────────────────────────────────────
async function fetchMachineStatus(machineId) {
  try {
    const res  = await fetch(`${API}/status/${machineId}`);
    if (!res.ok) return;
    const data = await res.json();
    setCardStatus(machineId, data.status);
  } catch {}
}

// ── HEARTBEAT ─────────────────────────────────────────────────────────────────
async function checkHeartbeat(machineId) {
  try {
    const res  = await fetch(`${API}/heartbeat/${machineId}`);
    const data = await res.json();
    const badge = document.getElementById(`conn-${machineId}`);
    if (!badge) return;

    const isLive = data.last_seen
      ? (Date.now() - new Date(data.last_seen).getTime()) < 90000
      : false;

    badge.className = `conn-badge ${isLive ? 'live' : 'no-signal'}`;
    badge.innerHTML = `<div class="conn-dot"></div><span>${isLive ? 'Live' : 'No Signal'}</span>`;

    // If no signal and downtime not active — set card to unknown
    if (!isLive && !cardDowntimes[machineId]) {
      const card = document.getElementById(`card-${machineId}`);
      if (card) {
        card.className = 'machine-card unknown';
        card.querySelector('.card-status').textContent = '--';
      }
    }
  } catch {}
}

function startHeartbeatPolling(machineId) {
  checkHeartbeat(machineId);
  setInterval(() => checkHeartbeat(machineId), 10000);
}

// ── SSE ───────────────────────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource(`${API}/stream`);

  es.onmessage = e => {
    try {
      const data = JSON.parse(e.data);

      // ── Downtime started ──────────────────────────────────────────────────
      if (data.type === 'downtime_start') {
        const { machine_id, reason, start } = data;
        delete pendingReason[machine_id];
        startCardDowntime(machine_id, reason, new Date(start));
        return;
      }

      // ── Downtime ended ────────────────────────────────────────────────────
      if (data.type === 'downtime_end') {
        delete pendingReason[data.machine_id];
        stopCardDowntime(data.machine_id);
        return;
      }

      // ── Regular status update ─────────────────────────────────────────────
      if (data.machine_id && data.status && data.status !== 'reason_updated') {
        const s = data.status.toUpperCase();
        // Track unlogged stops
        if (s === 'OFF') pendingReason[data.machine_id] = true;
        if (s === 'ON' && !pendingReason[data.machine_id] && !cardDowntimes[data.machine_id]) {
          setCardStatus(data.machine_id, data.status);
        } else if (s === 'OFF') {
          setCardStatus(data.machine_id, data.status);
        }
        // Mark as live on any incoming event
        const badge = document.getElementById(`conn-${data.machine_id}`);
        if (badge) {
          badge.className = 'conn-badge live';
          badge.innerHTML = `<div class="conn-dot"></div><span>Live</span>`;
        }
      }

    } catch {}
  };

  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 3000);
  };
}

// ── CARD DOWNTIME ─────────────────────────────────────────────────────────────
function startCardDowntime(machineId, reason, startTime) {
  // Stop any existing downtime timer for this machine
  stopCardDowntime(machineId);

  const card = document.getElementById(`card-${machineId}`);
  if (!card) return;

  // Show card as OFF with reason and counter
  card.className = 'machine-card off';
  card.querySelector('.card-status').textContent = '';

  const dtPanel  = document.getElementById(`dt-${machineId}`);
  const dtReason = document.getElementById(`dt-reason-${machineId}`);
  const dtCounter = document.getElementById(`dt-counter-${machineId}`);

  if (dtPanel)  dtPanel.style.display = 'flex';
  if (dtReason) dtReason.textContent = reason;

  const timer = setInterval(() => {
    const elapsed = Math.floor((new Date() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (dtCounter) dtCounter.textContent = `${h}:${m}:${s}`;
  }, 1000);

  cardDowntimes[machineId] = { timer, startTime };
}

function stopCardDowntime(machineId) {
  if (cardDowntimes[machineId]) {
    clearInterval(cardDowntimes[machineId].timer);
    delete cardDowntimes[machineId];
  }

  const dtPanel = document.getElementById(`dt-${machineId}`);
  if (dtPanel) dtPanel.style.display = 'none';

  // Refresh actual status from server
  fetchMachineStatus(machineId);
}

// ── ADD MACHINE ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('new-machine-name');
  const idInput   = document.getElementById('new-machine-id');
  if (nameInput && idInput) {
    nameInput.addEventListener('input', () => {
      idInput.value = nameInput.value.toLowerCase().trim()
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    });
  }
});

async function addMachine() {
  const name = document.getElementById('new-machine-name').value.trim();
  const id   = document.getElementById('new-machine-id').value.trim();
  const err  = document.getElementById('add-error');
  if (!name || !id) { err.textContent = 'Both fields are required.'; return; }

  try {
    const res  = await fetch('/api/add-station', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, id })
    });
    const data = await res.json();
    if (data.error) { err.textContent = data.error; return; }

    err.textContent = '';
    document.getElementById('new-machine-name').value = '';
    document.getElementById('new-machine-id').value   = '';

    MACHINES.push({ id, name });

    const grid = document.getElementById('machine-grid');
    const empty = grid.querySelector('.empty-state');
    if (empty) empty.remove();
    grid.appendChild(buildCard({ id, name }));
    fetchMachineStatus(id);
    startHeartbeatPolling(id);

    const counter = document.getElementById('machine-count');
    if (counter) counter.textContent = MACHINES.length + ' machine' + (MACHINES.length !== 1 ? 's' : '');
    renderMachinesList();
  } catch {
    document.getElementById('add-error').textContent = 'Server error. Try again.';
  }
}

// ── MACHINES LIST ─────────────────────────────────────────────────────────────
function renderMachinesList() {
  const container = document.getElementById('machines-list');
  if (!container) return;

  if (!MACHINES.length) {
    container.innerHTML = '<p class="muted">No machines added yet.</p>';
    return;
  }

  container.innerHTML = MACHINES.map(m => `
    <div class="machine-row" id="row-${m.id}">
      <div class="machine-row-info">
        <span class="machine-row-name">${m.name}</span>
        <span class="machine-row-id">${m.id}</span>
        <a class="machine-row-url" href="/station/${m.id}" target="_blank">${window.location.origin}/station/${m.id}</a>
      </div>
      <div class="machine-row-actions">
        <button class="btn-edit"   onclick="openEditModal('${m.id}', '${m.name}')">Edit</button>
        <button class="btn-danger" onclick="deleteMachine('${m.id}', '${m.name}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ── DELETE MACHINE ────────────────────────────────────────────────────────────
async function deleteMachine(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    const res  = await fetch(`/api/machine/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    MACHINES = MACHINES.filter(m => m.id !== id);
    const card = document.getElementById(`card-${id}`);
    if (card) card.remove();

    if (!MACHINES.length) {
      document.getElementById('machine-grid').innerHTML = `
        <div class="empty-state">
          <div class="big">⚙️</div>
          No machines added yet.<br>Go to <strong>Machines</strong> to add one.
        </div>`;
    }

    const counter = document.getElementById('machine-count');
    if (counter) counter.textContent = MACHINES.length + ' machine' + (MACHINES.length !== 1 ? 's' : '');
    renderMachinesList();
  } catch { alert('Server error.'); }
}

// ── EDIT MACHINE ──────────────────────────────────────────────────────────────
function openEditModal(id, name) {
  document.getElementById('edit-machine-original-id').value = id;
  document.getElementById('edit-machine-name').value        = name;
  document.getElementById('edit-machine-id').value          = id;
  document.getElementById('edit-error').textContent         = '';
  document.getElementById('edit-modal').style.display       = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

async function saveEdit() {
  const originalId = document.getElementById('edit-machine-original-id').value;
  const newName    = document.getElementById('edit-machine-name').value.trim();
  const newId      = document.getElementById('edit-machine-id').value.trim();
  const err        = document.getElementById('edit-error');
  if (!newName || !newId) { err.textContent = 'Both fields are required.'; return; }

  try {
    const res  = await fetch(`/api/machine/${originalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, id: newId })
    });
    const data = await res.json();
    if (data.error) { err.textContent = data.error; return; }

    const machine = MACHINES.find(m => m.id === originalId);
    if (machine) { machine.id = newId; machine.name = newName; }

    const card = document.getElementById(`card-${originalId}`);
    if (card) {
      card.id = `card-${newId}`;
      card.querySelector('.card-machine-name').textContent = newName;
      const badge = card.querySelector('.conn-badge');
      if (badge) badge.id = `conn-${newId}`;
    }

    closeEditModal();
    renderMachinesList();
  } catch { err.textContent = 'Server error.'; }
}

// ── EVENTS VIEW ───────────────────────────────────────────────────────────────
let donutChart = null;
let barChart   = null;

async function loadEvents() {
  const container = document.getElementById('events-list');
  if (!container) return;
  container.innerHTML = '<p class="muted">Loading...</p>';

  try {
    const res  = await fetch(`${API}/events-all`);
    const rows = await res.json();

    if (!rows.length) {
      container.innerHTML = '<p class="muted">No events today.</p>';
      renderDonut([]); renderBar([]);
      return;
    }

    const machines     = [...new Set(rows.map(r => r.machine_id))];
    const filterId     = 'events-filter';
    const currentFilter = document.getElementById(filterId)?.value || 'all';
    const filtered     = currentFilter === 'all' ? rows : rows.filter(r => r.machine_id === currentFilter);

    container.innerHTML = `
      <div class="events-toolbar">
        <select id="${filterId}" onchange="loadEvents()" class="events-filter">
          <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>All Machines</option>
          ${machines.map(m => `<option value="${m}" ${currentFilter === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <button class="btn-primary" onclick="loadEvents()" style="padding:8px 14px;font-size:12px">↻ Refresh</button>
      </div>
      <div class="events-table-wrap">
        <table class="events-table">
          <thead><tr><th>Machine</th><th>Time</th><th>Status</th><th>Duration</th><th>Reason</th></tr></thead>
          <tbody>
            ${filtered.map(r => {
              const time  = new Date(r.timestamp).toLocaleTimeString('en-GB');
              const dur   = r.duration_seconds != null ? fmtDuration(Math.abs(Math.round(r.duration_seconds))) : '--';
              const cls   = r.status?.toLowerCase();
              const mName = MACHINES.find(m => m.id === r.machine_id)?.name || r.machine_id;
              return `<tr>
                <td>${mName}</td><td>${time}</td>
                <td><span class="event-badge ${cls}">${r.status?.toUpperCase() || '--'}</span></td>
                <td>${dur}</td><td>${r.reason || '--'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    renderDonut(filtered);
    renderBar(filtered);

  } catch {
    container.innerHTML = '<p class="muted">Failed to load events.</p>';
  }
}

function fmtDuration(s) {
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function renderDonut(rows) {
  const ctx = document.getElementById('chart-donut');
  if (!ctx) return;
  const reasons = {};
  rows.forEach(r => {
    if (r.status?.toUpperCase() === 'OFF' && r.duration_seconds > 0 && r.reason) {
      reasons[r.reason] = (reasons[r.reason] || 0) + Math.abs(r.duration_seconds);
    }
  });
  const labels  = Object.keys(reasons);
  const data    = labels.map(k => Math.round(reasons[k] / 60));
  const colours = ['#FF6B00','#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
  if (donutChart) { donutChart.destroy(); donutChart = null; }
  if (!labels.length) { ctx.style.display = 'none'; return; }
  ctx.style.display = '';
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colours.slice(0, labels.length), borderWidth: 2 }] },
    options: { responsive: true, plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
      tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} min` } }
    }}
  });
}

function renderBar(rows) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  const hours = {};
  rows.forEach(r => {
    if (r.status?.toUpperCase() === 'OFF' && r.duration_seconds > 0) {
      const h = new Date(r.timestamp).getHours();
      hours[h] = (hours[h] || 0) + Math.abs(r.duration_seconds) / 60;
    }
  });
  const active = Object.keys(hours).filter(h => hours[h] > 0);
  if (barChart) { barChart.destroy(); barChart = null; }
  if (!active.length) { ctx.style.display = 'none'; return; }
  ctx.style.display = '';
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: active.map(h => `${String(h).padStart(2,'0')}:00`),
      datasets: [{ label: 'Downtime (min)', data: active.map(h => Math.round(hours[h]*10)/10), backgroundColor: '#FF6B00', borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutes' } } }
    }
  });
}
