#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>

// ── HARDWARE ──────────────────────────────────────────────────────────────────
Adafruit_ADS1115 ads;
#define BOOT_BUTTON 0  // GPIO0 — the BOOT button on ESP32 Dev Module

// ── WIFI CREDENTIALS (fixed) ──────────────────────────────────────────────────
const char* ssid     = "Clamason Wi-Fi";
const char* password = "G1br4ltar2023!";

// ── SERVER URLS ───────────────────────────────────────────────────────────────
const char* serverUrl    = "http://192.168.0.32:3000/api/event";
const char* heartbeatUrl = "http://192.168.0.32:3000/api/heartbeat";

// ── CONFIG ────────────────────────────────────────────────────────────────────
const float THRESHOLD = 1.5;
Preferences prefs;
String machineId = "";

// ── RUNTIME ───────────────────────────────────────────────────────────────────
String lastStatus = "";
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;

// ── CONFIG PORTAL ─────────────────────────────────────────────────────────────
WebServer portalServer(80);

void startConfigPortal() {
  Serial.println("Starting config portal...");
  WiFi.softAP("ShopFloorPulse-Setup");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  portalServer.on("/", HTTP_GET, []() {
    String html = R"rawhtml(
<!DOCTYPE html><html><head>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<style>
  body { font-family: sans-serif; background: #f4f6f8; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .box { background: white; border-radius: 14px; padding: 32px; width: 90%; max-width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  h2 { font-size: 18px; color: #FF6B00; margin-bottom: 6px; letter-spacing: 1px; }
  p  { font-size: 12px; color: #888; margin-bottom: 20px; }
  label { font-size: 11px; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  input { width: 100%; padding: 10px 12px; margin-top: 6px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
  button { width: 100%; padding: 12px; background: #FF6B00; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; }
</style></head><body>
<div class='box'>
  <h2>ShopFloorPulse</h2>
  <p>Set the Machine ID for this ESP unit</p>
  <form action='/save' method='POST'>
    <label>Machine ID</label>
    <input type='text' name='machine_id' placeholder='e.g. pero-degreaser' required />
    <button type='submit'>Save &amp; Start</button>
  </form>
</div>
</body></html>
)rawhtml";
    portalServer.send(200, "text/html", html);
  });

  portalServer.on("/save", HTTP_POST, []() {
    if (portalServer.hasArg("machine_id")) {
      String newId = portalServer.arg("machine_id");
      newId.trim();
      newId.toLowerCase();
      newId.replace(" ", "-");

      prefs.begin("sfp", false);
      prefs.putString("machine_id", newId);
      prefs.end();

      portalServer.send(200, "text/html",
        "<html><body style='font-family:sans-serif;text-align:center;padding:40px'>"
        "<h2 style='color:#2ecc71'>Saved!</h2>"
        "<p>Machine ID: <strong>" + newId + "</strong></p>"
        "<p>ESP is restarting...</p></body></html>");
      delay(2000);
      ESP.restart();
    } else {
      portalServer.send(400, "text/plain", "Missing machine_id");
    }
  });

  portalServer.begin();
  Serial.println("Portal ready. Connect to ShopFloorPulse-Setup");

  while (true) {
    portalServer.handleClient();
  }
}

// ── WIFI ──────────────────────────────────────────────────────────────────────
bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.println("WiFi lost, reconnecting...");
  WiFi.reconnect();
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  return WiFi.status() == WL_CONNECTED;
}

// ── POST HELPERS ──────────────────────────────────────────────────────────────
void postStatus(String status) {
  if (!ensureWiFi()) return;
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  String payload = "{\"machine_id\":\"" + machineId + "\",\"status\":\"" + status + "\"}";
  int code = http.POST(payload);
  Serial.print("Status posted: "); Serial.print(status);
  Serial.print(" Response: "); Serial.println(code);
  http.end();
}

void postHeartbeat() {
  if (!ensureWiFi()) return;
  HTTPClient http;
  http.begin(heartbeatUrl);
  http.addHeader("Content-Type", "application/json");
  String payload = "{\"machine_id\":\"" + machineId + "\"}";
  int code = http.POST(payload);
  Serial.print("Heartbeat sent. Response: "); Serial.println(code);
  http.end();
}

// ── CURRENT READING ───────────────────────────────────────────────────────────
float readAmps() {
  float sum = 0;
  int count = 0;
  long startTime = millis();
  while (millis() - startTime < 1000) {
    int16_t raw = ads.readADC_Differential_0_1();
    float voltage = raw * 0.03125F;
    sum += voltage * voltage;
    count++;
    delay(10);
  }
  return sqrt(sum / count) * (100.0 / 1.65);
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(BOOT_BUTTON, INPUT_PULLUP);

  // Load stored machine ID
  prefs.begin("sfp", true);
  machineId = prefs.getString("machine_id", "");
  prefs.end();

  Serial.print("Stored machine ID: ");
  Serial.println(machineId.length() ? machineId : "(none)");

  // Enter config portal if BOOT held OR no machine ID saved
  if (digitalRead(BOOT_BUTTON) == LOW || machineId.length() == 0) {
    startConfigPortal(); // never returns
  }

  // Normal boot
  Wire.begin(21, 22);
  ads.setGain(GAIN_FOUR);
  if (!ads.begin()) {
    Serial.println("ADS1115 not found!");
    while (1);
  }
  Serial.println("ADS1115 ready");

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
  Serial.println(WiFi.localIP());
  Serial.print("Monitoring machine: ");
  Serial.println(machineId);
}

// ── LOOP ──────────────────────────────────────────────────────────────────────
void loop() {
  // Heartbeat
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    postHeartbeat();
    lastHeartbeat = millis();
  }

  // Current reading
  float amps = readAmps();
  String status = amps > THRESHOLD ? "ON" : "OFF";

  Serial.print("Amps: "); Serial.print(amps, 3);
  Serial.print("  Status: "); Serial.println(status);

  static int confirm = 0;
  static String pendingStatus = "";

  if (status == pendingStatus) {
    confirm++;
  } else {
    pendingStatus = status;
    confirm = 1;
  }

  if (confirm >= 1 && pendingStatus != lastStatus) {
    postStatus(pendingStatus);
    lastStatus = pendingStatus;
    confirm = 0;
  }

  delay(1000);
}
