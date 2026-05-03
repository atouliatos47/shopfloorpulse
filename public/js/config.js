let SFP_CONFIG = null;

async function loadConfig() {
  const res = await fetch('/api/config');
  SFP_CONFIG = await res.json();
  return SFP_CONFIG;
}