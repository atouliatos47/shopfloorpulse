// ── COG SVG ──────────────────────────────────────────────────────────────────
function cogSVG(size) {
  return `
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <path class="cog-svg" d="
      M43,5 L57,5 L60,18
      C63,19 66,21 69,23 L82,17 L91,26 L85,39
      C87,42 89,45 90,48 L103... 
      M50,30 A20,20 0 1,1 50,70 A20,20 0 1,1 50,30 Z
    "/>
    <!-- Proper gear shape -->
    <g class="cog-svg">
      <circle cx="50" cy="50" r="18"/>
      <rect x="46" y="2"  width="8" height="18" rx="3"/>
      <rect x="46" y="80" width="8" height="18" rx="3"/>
      <rect x="2"  y="46" width="18" height="8" rx="3"/>
      <rect x="80" y="46" width="18" height="8" rx="3"/>
      <rect x="46" y="2"  width="8" height="18" rx="3" transform="rotate(45 50 50)"/>
      <rect x="46" y="80" width="8" height="18" rx="3" transform="rotate(45 50 50)"/>
      <rect x="2"  y="46" width="18" height="8" rx="3" transform="rotate(45 50 50)"/>
      <rect x="80" y="46" width="18" height="8" rx="3" transform="rotate(45 50 50)"/>
      <circle cx="50" cy="50" r="12" fill="white"/>
    </g>
  </svg>`;
}

function renderCog(sizeClass) {
  const size = sizeClass === 'large' ? 75 : 50;
  return `
  <svg class="cog-${sizeClass}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g class="cog-svg">
      <circle cx="50" cy="50" r="18"/>
      <rect x="46" y="2"  width="8" height="20" rx="3"/>
      <rect x="46" y="78" width="8" height="20" rx="3"/>
      <rect x="2"  y="46" width="20" height="8" rx="3"/>
      <rect x="78" y="46" width="20" height="8" rx="3"/>
      <rect x="46" y="2"  width="8" height="20" rx="3" transform="rotate(45 50 50)"/>
      <rect x="46" y="78" width="8" height="20" rx="3" transform="rotate(45 50 50)"/>
      <rect x="2"  y="46" width="20" height="8" rx="3" transform="rotate(45 50 50)"/>
      <rect x="78" y="46" width="20" height="8" rx="3" transform="rotate(45 50 50)"/>
      <circle cx="50" cy="50" r="11" fill="white"/>
    </g>
  </svg>`;
}

// ── CARD RENDERING ────────────────────────────────────────────────────────────
function buildCard(machine) {
  const card = document.createElement('div');
  card.className = 'machine-card unknown';
  card.id = `card-${machine.id}`;
  card.innerHTML = `
    <div class="conn-badge no-signal" id="conn-${machine.id}">
      <div class="conn-dot"></div><span>No Signal</span>
    </div>
    <div class="card-machine-name">${machine.name}</div>
    <div class="cog-wrapper">
      ${renderCog('large')}
      ${renderCog('small')}
    </div>
    <div class="card-status">--</div>
    <div class="card-since">Waiting for signal...</div>
  `;
  return card;
}

function updateCard(machineId, status, timestamp) {
  const card = document.getElementById(`card-${machineId}`);
  if (!card) return;

  const state = status ? status.toLowerCase() : 'unknown';
  card.className = `machine-card ${state}`;

  const label = card.querySelector('.card-status');
  const since = card.querySelector('.card-since');

  label.textContent = status ? status.toUpperCase() : '--';
  since.textContent = timestamp
    ? 'Since ' + new Date(timestamp).toLocaleTimeString('en-GB')
    : 'No signal yet';


}

// ── INIT ──────────────────────────────────────────────────────────────────────
let MACHINES = [];

function initDashboard(machines) {
  MACHINES = machines;
  const grid = document.getElementById('machine-grid');
  grid.innerHTML = '';

  if (!machines || machines.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="big">⚙️</div>
        No machines added yet.<br>Click <strong>+ Add Machine</strong> to get started.
      </div>`;
    return;
  }

  machines.forEach(m => {
    const card = buildCard(m);
    grid.appendChild(card);
    fetchStatus(m.id);
    startHeartbeatPolling(m.id);
  });

  connectSSE();
}

// ── FETCH INITIAL STATUS ──────────────────────────────────────────────────────
async function fetchStatus(machineId) {
  try {
    const res = await fetch(`${API}/status/${machineId}`);
    if (!res.ok) return;
    const data = await res.json();
    updateCard(machineId, data.status, data.timestamp);
  } catch (err) {
    console.error(`Status fetch failed for ${machineId}:`, err);
  }
}

// ── HEARTBEAT ─────────────────────────────────────────────────────────────────
async function checkHeartbeat(machineId) {
  try {
    const res = await fetch(`${API}/heartbeat/${machineId}`);
    const data = await res.json();
    const badge = document.getElementById(`conn-${machineId}`);
    if (!badge) return;

    if (data.last_seen) {
      const age = Date.now() - new Date(data.last_seen).getTime();
      const isLive = age < 60 * 1000; // LIVE if heartbeat within 60 seconds
      badge.className = `conn-badge ${isLive ? 'live' : 'no-signal'}`;
      badge.innerHTML = `<div class="conn-dot"></div><span>${isLive ? 'Live' : 'No Signal'}</span>`;
    } else {
      badge.className = 'conn-badge no-signal';
      badge.innerHTML = `<div class="conn-dot"></div><span>No Signal</span>`;
    }
  } catch (err) {
    console.error(`Heartbeat check failed for ${machineId}:`, err);
  }
}

function startHeartbeatPolling(machineId) {
  checkHeartbeat(machineId);
  setInterval(() => checkHeartbeat(machineId), 30000);
}

// ── SSE — listens for ALL machines ────────────────────────────────────────────
function connectSSE() {
  const evtSource = new EventSource(`${API}/stream`);

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.machine_id && data.status !== 'reason_updated') {
        updateCard(data.machine_id, data.status, data.timestamp || new Date().toISOString());
      }
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(connectSSE, 3000);
  };
}

// ── ADD MACHINE ───────────────────────────────────────────────────────────────
function openAddMachine() {
  document.getElementById('new-machine-name').value = '';
  document.getElementById('new-machine-id').value = '';
  document.getElementById('add-error').textContent = '';
  document.getElementById('add-modal').style.display = 'flex';
}

function closeAddMachine() {
  document.getElementById('add-modal').style.display = 'none';
}

// Auto-generate ID from name
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('new-machine-name');
  const idInput   = document.getElementById('new-machine-id');
  if (nameInput && idInput) {
    nameInput.addEventListener('input', () => {
      idInput.value = nameInput.value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
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

    closeAddMachine();

    // Add card immediately without full reload
    const grid = document.getElementById('machine-grid');
    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const newMachine = { id, name };
    MACHINES.push(newMachine);
    const card = buildCard(newMachine);
    grid.appendChild(card);
    fetchStatus(id);
    startHeartbeatPolling(id);

  } catch (e) {
    err.textContent = 'Server error. Try again.';
  }
}
