async function loadStatus() {
  try {
    const res = await fetch(`${API}/status/${MACHINE_ID}`);
    const data = await res.json();
    const since = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString('en-GB')
      : '--';

    document.getElementById('status-card').innerHTML = `
      <div class="card">
        <h2>Live Status</h2>
        <div class="status-indicator">
          <div class="status-dot ${data.status?.toLowerCase()}"></div>
          <span class="status-label">${data.status?.toUpperCase() || 'UNKNOWN'}</span>
        </div>
        <div class="status-since">Since ${since}</div>
      </div>
    `;
  } catch (err) {
    console.error('Status load error:', err);
  }
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