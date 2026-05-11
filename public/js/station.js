const MACHINE_ID = 'pero-degreaser';
const API = '/api';
let currentStatus = '';
let stopTimer = null;
let stopStart = null;
let currentReason = '';

async function loadStationStatus() {
  try {
    const res = await fetch(`${API}/status/${MACHINE_ID}`);
    const data = await res.json();
    updateDisplay(data.status, data.timestamp);
  } catch (err) {
    console.error('Station status error:', err);
  }
}

function updateDisplay(status, timestamp) {
  const dot = document.getElementById('big-dot');
  const label = document.getElementById('big-status');
  const since = document.getElementById('big-since');

  const s = status?.toLowerCase();
  dot.className = s || '';
  label.textContent = status?.toUpperCase() || '--';
  since.textContent = timestamp
    ? 'Since ' + new Date(timestamp).toLocaleTimeString('en-GB')
    : '--';

  if (s === 'off' && currentStatus === 'on') {
    stopStart = new Date();
    currentReason = '';
    document.getElementById('reason-display').style.display = 'none';
    document.getElementById('reason-modal').style.display = 'flex';
  }

  if (s === 'on') {
    clearInterval(stopTimer);
    currentReason = '';
    document.getElementById('reason-display').style.display = 'none';
    document.getElementById('reason-modal').style.display = 'none';
  }

  currentStatus = s;
}

function startStopCounter() {
  clearInterval(stopTimer);
  stopTimer = setInterval(() => {
    if (!stopStart) return;
    const elapsed = Math.floor((new Date() - stopStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    const counter = document.getElementById('stop-counter');
    if (counter) counter.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

async function logReason(reason) {
  currentReason = reason;
  document.getElementById('reason-modal').style.display = 'none';

  // Show reason display
  const display = document.getElementById('reason-display');
  display.style.display = 'block';
  document.getElementById('reason-label').textContent = reason;
  stopStart = stopStart || new Date();
  startStopCounter();

  try {
    await fetch(`${API}/reason`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: MACHINE_ID, reason })
    });
  } catch (err) {
    console.error('Reason log error:', err);
  }
}

function connectSSE() {
  const evtSource = new EventSource(`${API}/stream`);
  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.machine_id === MACHINE_ID) {
      updateDisplay(data.status, data.timestamp);
    }
  };
  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}

loadStationStatus();
setInterval(loadStationStatus, 10000);
connectSSE();