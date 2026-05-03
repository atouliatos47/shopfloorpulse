const SHIFT_START_HOUR = 6; // 6am shift start

async function loadTimeline() {
  try {
    const res = await fetch(`${API}/events/${MACHINE_ID}`);
    const events = await res.json();

    const now = new Date();
    const shiftStart = new Date();
    shiftStart.setHours(SHIFT_START_HOUR, 0, 0, 0);
    const shiftDuration = now - shiftStart;

    let segments = '';
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const nextEvent = events[i - 1];
      const eventTime = new Date(event.timestamp);
      const endTime = nextEvent ? new Date(nextEvent.timestamp) : now;
      const duration = endTime - eventTime;
      const width = (duration / shiftDuration) * 100;
      if (width > 0) {
        segments = `<div class="timeline-segment ${event.status.toLowerCase()}" 
          style="width:${width}%" 
          title="${event.status} at ${eventTime.toLocaleTimeString('en-GB')}">
        </div>` + segments;
      }
    }

    const html = `
      <div class="card">
        <h2>Shift Timeline (from ${SHIFT_START_HOUR}:00)</h2>
        <div class="timeline-bar">${segments || '<div style="width:100%;background:#243547"></div>'}</div>
      </div>
    `;

    document.getElementById('timeline-card').innerHTML = html;
  } catch (err) {
    console.error('Timeline load error:', err);
  }
}

loadTimeline();
setInterval(loadTimeline, 10000);