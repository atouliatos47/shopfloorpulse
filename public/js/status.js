async function loadStatus() {
  try {
    const res = await fetch(`${API}/status/${MACHINE_ID}`);
    const data = await res.json();
    const since = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString('en-GB')
      : '--';

    const reasonBox = data.status?.toLowerCase() === 'off' ? `
      <div class="reason-box">
        <input id="reason-input" type="text" placeholder="Enter reason for stoppage...">
        <button onclick="submitReason()">Submit</button>
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
        ${reasonBox}
      </div>
    `;
    document.getElementById('status-card').innerHTML = html;
  } catch (err) {
    console.error('Status load error:', err);
  }
}

async function submitReason() {
  const reason = document.getElementById('reason-input').value.trim();
  if (!reason) return alert('Please enter a reason');
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
  evtSource.onerror = (err) => {
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}

loadStatus();
setInterval(loadStatus, 10000);
connectSSE();