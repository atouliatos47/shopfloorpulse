async function loadEvents() {
  try {
    const res = await fetch(`${API}/events/${MACHINE_ID}`);
    const events = await res.json();

    const rows = events.map((e, i) => {
      const prevEvent = events[i - 1];
      let duration = '—';
      if (e.status.toLowerCase() === 'off') {
        const endTime = prevEvent ? new Date(prevEvent.timestamp) : null;
        if (endTime) {
          const elapsed = Math.floor((endTime - new Date(e.timestamp)) / 1000);
          if (elapsed > 0) {
            const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
            const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
            const s = String(elapsed % 60).padStart(2, '0');
            duration = `${h}:${m}:${s}`;
          }
        } else {
          duration = 'ongoing';
        }
      }

      return `
        <tr>
          <td>${new Date(e.timestamp).toLocaleDateString('en-GB')} ${new Date(e.timestamp).toLocaleTimeString('en-GB')}</td>
          <td><span class="badge ${e.status.toLowerCase()}">${e.status}</span></td>
          <td>${e.reason || '—'}</td>
          <td>${duration}</td>
        </tr>
      `;
    }).join('');

    const tbody = document.getElementById('events-tbody');
    if (tbody) {
      tbody.innerHTML = rows || '<tr><td colspan="4" style="color:#aaaaaa">No events today</td></tr>';
    }

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