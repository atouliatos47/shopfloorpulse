#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <WiFi.h>
#include <HTTPClient.h>

Adafruit_ADS1115 ads;

const char* ssid        = "Clamason Wi-Fi";
const char* password    = "G1br4ltar2023!";
const char* serverUrl   = "https://shopfloorpulse.onrender.com/api/event";
const char* heartbeatUrl = "https://shopfloorpulse.onrender.com/api/heartbeat";
const char* machineId   = "pero-degreaser";
const float THRESHOLD   = 1.5;

String lastStatus   = "";
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

void setup() {
  Serial.begin(115200);
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
}

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
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconnect failed");
    return false;
  }
  return true;
}

void postStatus(String status) {
  if (!ensureWiFi()) return;
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  String payload = "{\"machine_id\":\"" + String(machineId) + "\",\"status\":\"" + status + "\"}";
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
  String payload = "{\"machine_id\":\"" + String(machineId) + "\"}";
  int code = http.POST(payload);
  Serial.print("Heartbeat sent. Response: "); Serial.println(code);
  http.end();
}

void loop() {
  // ── Heartbeat ──────────────────────────────────────────────
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    postHeartbeat();
    lastHeartbeat = millis();
  }

  // ── Current reading ────────────────────────────────────────
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

  if (confirm >= 2 && pendingStatus != lastStatus) {
    postStatus(pendingStatus);
    lastStatus = pendingStatus;
    confirm = 0;
  }

  delay(1000);
}
