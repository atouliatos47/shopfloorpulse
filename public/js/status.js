const MACHINE_ID = 'pero-degreaser';
const API = '/api';

async function loadStatus() {
  try {
    const res = await fetch(`${API}/status/${MACHINE_ID}`);
    const data = await res.json();

    const since = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString('en-GB')
      : '--';

    const html = `
      <div class="card">
        <h2>Live Status</h2>
        <div class="status-indicator">
          <div class="status-dot ${data.status?.toLowerCase()}"></div>
          <span class="status-label">${data.status?.toUpperCase() || 'UNKNOWN'}</span>
        </div>
        <div class="status-since">Since ${since}</div>
      </div>
    `;

    document.getElementById('status-card').innerHTML = html;
  } catch (err) {
    console.error('Status load error:', err);
  }
}

loadStatus();
setInterval(loadStatus, 5000);