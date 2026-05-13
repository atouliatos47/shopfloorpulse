// ── COG SVG ───────────────────────────────────────────────────────────────────
function renderCog(sizeClass) {
  const teeth = 8;
  const cx = 50, cy = 50;
  const innerR = sizeClass === 'large' ? 16 : 14;
  const outerR = sizeClass === 'large' ? 26 : 22;
  const holeR  = sizeClass === 'large' ? 8  : 7;
  const toothW = (2 * Math.PI) / teeth;

  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = i * toothW - Math.PI / 2;
    const a1 = a0 + toothW * 0.35;
    const a2 = a0 + toothW * 0.5;
    const a3 = a0 + toothW * 0.65;
    const a4 = a0 + toothW;

    const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;

    if (i === 0) d += `M ${p(innerR, a0)} `;
    else d += `L ${p(innerR, a0)} `;
    d += `L ${p(outerR, a1)} L ${p(outerR, a2)} L ${p(outerR, a3)} L ${p(innerR, a4)} `;
  }
  d += 'Z';

  return `
  <svg class="cog-${sizeClass}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path class="cog-svg" d="${d}" fill-rule="evenodd"/>
    <circle cx="${cx}" cy="${cy}" r="${holeR}" fill="white"/>
  </svg>`;
}

// ── CARD ──────────────────────────────────────────────────────────────────────
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
  `;
  return card;
}

function updateCard(machineId, status, timestamp) {
  const card = document.getElementById(`card-${machineId}`);
  if (!card) return;

  const state = status ? status.toLowerCase() : 'unknown';
  card.className = `machine-card ${state}`;
  card.querySelector('.card-status').textContent = status ? status.toUpperCase() : '--';
}

// ── INIT ──────────────────────────────────────────────────────────────────────
let MACHINES = [];

function initDashboard(machines) {
  MACHINES = machines;
  const grid = document.getElementById('machine-grid');
  grid.innerHTML = '';

  const counter = document.getElementById('machine-count');
  if (counter) counter.textContent = machines.length + ' machine' + (machines.length !== 1 ? 's' : '');

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
    fetchStatus(m.id);
    startHeartbeatPolling(m.id);
  });

  connectSSE();
}

// ── STATUS ────────────────────────────────────────────────────────────────────
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
      const isLive = age < 35 * 1000;
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
  setInterval(() => checkHeartbeat(machineId), 10000);
}

// ── SSE ───────────────────────────────────────────────────────────────────────
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
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('new-machine-name');
  const idInput   = document.getElementById('new-machine-id');
  if (nameInput && idInput) {
    nameInput.addEventListener('input', () => {
      idInput.value = nameInput.value
        .toLowerCase().trim()
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

    err.textContent = '';
    document.getElementById('new-machine-name').value = '';
    document.getElementById('new-machine-id').value   = '';

    const newMachine = { id, name };
    MACHINES.push(newMachine);

    // Add card to grid
    const grid = document.getElementById('machine-grid');
    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    grid.appendChild(buildCard(newMachine));
    fetchStatus(id);
    startHeartbeatPolling(id);

    // Update counter
    const counter = document.getElementById('machine-count');
    if (counter) counter.textContent = MACHINES.length + ' machine' + (MACHINES.length !== 1 ? 's' : '');

    renderMachinesList();

  } catch (e) {
    document.getElementById('add-error').textContent = 'Server error. Try again.';
  }
}

// ── MACHINES LIST (settings view) ─────────────────────────────────────────────
function renderMachinesList() {
  const container = document.getElementById('machines-list');
  if (!container) return;

  if (MACHINES.length === 0) {
    container.innerHTML = '<p class="muted">No machines added yet.</p>';
    return;
  }

  container.innerHTML = MACHINES.map(m => `
    <div class="machine-row" id="row-${m.id}">
      <div class="machine-row-info">
        <span class="machine-row-name">${m.name}</span>
        <span class="machine-row-id">${m.id}</span>
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

    // Remove card
    const card = document.getElementById(`card-${id}`);
    if (card) card.remove();

    // Show empty state if no machines left
    if (MACHINES.length === 0) {
      document.getElementById('machine-grid').innerHTML = `
        <div class="empty-state">
          <div class="big">⚙️</div>
          No machines added yet.<br>Go to <strong>Machines</strong> to add one.
        </div>`;
    }

    // Update counter
    const counter = document.getElementById('machine-count');
    if (counter) counter.textContent = MACHINES.length + ' machine' + (MACHINES.length !== 1 ? 's' : '');

    renderMachinesList();

  } catch (e) {
    alert('Server error. Try again.');
  }
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

    // Update local list
    const machine = MACHINES.find(m => m.id === originalId);
    if (machine) { machine.id = newId; machine.name = newName; }

    // Update card
    const card = document.getElementById(`card-${originalId}`);
    if (card) {
      card.id = `card-${newId}`;
      card.querySelector('.card-machine-name').textContent = newName;
      const badge = card.querySelector('.conn-badge');
      if (badge) badge.id = `conn-${newId}`;
    }

    closeEditModal();
    renderMachinesList();

  } catch (e) {
    err.textContent = 'Server error. Try again.';
  }
}
