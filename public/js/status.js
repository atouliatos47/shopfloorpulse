async function loadStatus() {
  try {
    const res = await fetch(`${API}/status/${MACHINE_ID}`);
    const data = await res.json();
    const since = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString('en-GB')
      : '--';

    const isOff = data.status?.toLowerCase() === 'off';

    const reasonButtons = isOff ? `
      <div class="reason-prompt">Why did it stop?</div>
      <div class="reason-grid">
        <button class="reason-btn" onclick="logReason('Breakdown')">🔧 Breakdown</button>
        <button class="reason-btn" onclick="logReason('No Work / No Orders')">📭 No Work</button>
        <button class="reason-btn" onclick="logReason('Changeover / Setup')">🔄 Changeover</button>
        <button class="reason-btn" onclick="logReason('Cleaning')">🧹 Cleaning</button>
        <button class="reason-btn" onclick="logReason('Planned Maintenance')">📋 Planned Maintenance</button>
        <button class="reason-btn" onclick="logReason('Operator Break')">☕ Operator Break</button>
        <button class="reason-btn" onclick="logReason('Other')">❓ Other</button>
      </div>
    ` : '';

    const html = `
      <div class="card">
        <h2>Live Status</h2>
        <div class="status-indicator">
          <div class="status-dot ${data.status?.toLowerCase()}"></div>
          <span class="status-label">${data.status?.toUpperCase() || 'UNKNOWN'}</span>
        </div>
        <div class="status-since">Since ${since}</div>
        ${reasonButtons}
      </div>
    `;
    document.getElementById('status-card').innerHTML = html;
  } catch (err) {
    console.error('Status load error:', err);
  }
}

async function logReason(reason) {
  await fetch(`${API}/reason`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: MACHINE_ID, reason })
  });
  loadEvents();
  loadStatus();
}

function connectSSE() {
  const evtSource = new EventSource(`${API}/stream`);
  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.machine_id === MACHINE_ID) {
      if (data.status === 'reason_updated') {
        loadEvents();
      } else {
        loadStatus();
        loadEvents();
        loadTimeline();
      }
    }
  };
  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}

loadStatus();
setInterval(loadStatus, 10000);
connectSSE();