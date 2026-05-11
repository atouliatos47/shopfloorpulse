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

    // Update modal content if open
    const tbody = document.getElementById('events-tbody');
    if (tbody) {
      tbody.innerHTML = rows || '<tr><td colspan="3" style="color:#aaaaaa">No events today</td></tr>';
    }

    // Show button card
    document.getElementById('events-card').innerHTML = `
      <div class="card">
        <h2>Event Log</h2>
        <button class="events-btn" onclick="openEventsModal()">View Today's Events</button>
      </div>
    `;
  } catch (err) {
    console.error('Events load error:', err);
  }
}

function openEventsModal() {
  document.getElementById('events-modal').style.display = 'flex';
}

function closeEventsModal() {
  document.getElementById('events-modal').style.display = 'none';
}

loadEvents();