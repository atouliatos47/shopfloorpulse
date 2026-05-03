async function loadEvents() {
  try {
    const res = await fetch(`${API}/events/${MACHINE_ID}`);
    const events = await res.json();

    const rows = events.map(e => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleTimeString('en-GB')}</td>
        <td><span class="badge ${e.status.toLowerCase()}">${e.status}</span></td>
        <td>${e.reason || '—'}</td>
      </tr>
    `).join('');

    const html = `
      <div class="card">
        <h2>Event Log</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="color:#aaaaaa">No events today</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('events-card').innerHTML = html;
  } catch (err) {
    console.error('Events load error:', err);
  }
}

loadEvents();
setInterval(loadEvents, 10000);