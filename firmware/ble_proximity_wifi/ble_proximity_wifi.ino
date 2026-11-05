#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_gap_ble_api.h>
#include <esp_system.h>
#include <sys/time.h>
#include <atomic>

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

// Classic ESP32, built-in BLE. Select Huge APP partition for BLE + Wi-Fi.
constexpr char SERVICE_UUID[] = "4f6c0001-b5a3-4f01-9f58-51f59c12a001";
constexpr char TAG_ID_UUID[] = "4f6c0002-b5a3-4f01-9f58-51f59c12a001";
constexpr int BUZZER_PIN = 25;
// Starting thresholds to calibrate on site; RSSI is not a distance in metres.
constexpr int NEAR_RSSI = -65, FAR_RSSI = -78;
constexpr uint32_t LOST_MS = 8000, REPORT_MS = 5000;

struct LinkSample {
  uint8_t address[6];
  bool connected;
  int rssi;
  uint32_t sampledAt, revision, connection;
};
LinkSample linkSample = {};
portMUX_TYPE linkLock = portMUX_INITIALIZER_UNLOCKED;
Preferences settings;
char tagId[16], bootId[33];
// 0 = unconfigured/off; 1 = active LOW; 2 = active HIGH.
uint8_t buzzerMode = 0;
bool armed = false, haveFilter = false;
float filteredRssi = 0;
uint8_t nearCount = 0, farCount = 0;
uint32_t lastSample = 0, lastRevision = 0, lastConnection = 0, lastRssiRequest = 0;
uint32_t lastReport = 0, sequence = 0, testStarted = 0;
bool testingBuzzer = false;
enum class Proximity { Waiting, Near, Far, Lost };
Proximity state = Proximity::Waiting;

struct Report {
  char eventId[48], observedAt[25], state[8];
  int rssi;
  bool hasRssi, buzzerEnabled;
};
QueueHandle_t reports;
std::atomic<bool> clockReady{false};

const char* stateName(Proximity value) {
  switch(value) {
    case Proximity::Near: return "near";
    case Proximity::Far: return "far";
    case Proximity::Lost: return "lost";
    default: return "waiting";
  }
}

class PhoneCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*, esp_ble_gatts_cb_param_t* param) override {
    portENTER_CRITICAL(&linkLock);
    memcpy(linkSample.address, param->connect.remote_bda, 6);
    linkSample.connected = true;
    ++linkSample.connection;
    portEXIT_CRITICAL(&linkLock);
  }
  void onDisconnect(BLEServer*) override {
    portENTER_CRITICAL(&linkLock);
    linkSample.connected = false;
    portEXIT_CRITICAL(&linkLock);
  }
} phoneCallbacks;

void gapEvent(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t* param) {
  if (event != ESP_GAP_BLE_READ_RSSI_COMPLETE_EVT || param->read_rssi_cmpl.status != ESP_BT_STATUS_SUCCESS) return;
  const int rssi = param->read_rssi_cmpl.rssi;
  if (rssi < -127 || rssi > 20) return; // 127 means unavailable.
  portENTER_CRITICAL(&linkLock);
  if (linkSample.connected && memcmp(linkSample.address, param->read_rssi_cmpl.remote_addr, 6) == 0) {
    linkSample.rssi = rssi;
    linkSample.sampledAt = millis();
    ++linkSample.revision;
  }
  portEXIT_CRITICAL(&linkLock);
}

void updateProximity(uint32_t now) {
  LinkSample sample;
  portENTER_CRITICAL(&linkLock);
  sample = linkSample;
  portEXIT_CRITICAL(&linkLock);
  if (sample.connection != lastConnection) {
    lastConnection = sample.connection;
    lastRevision = sample.revision;
    haveFilter = false;
    nearCount = farCount = 0;
    Serial.println("Phone connected. Keep it nearby to arm.");
  }
  if (sample.connected && now - lastRssiRequest >= 1000) {
    lastRssiRequest = now;
    esp_ble_gap_read_rssi(sample.address);
  }
  if (sample.connected && sample.revision != lastRevision) {
    lastRevision = sample.revision;
    lastSample = sample.sampledAt;
    filteredRssi = haveFilter ? 0.25f * sample.rssi + 0.75f * filteredRssi : sample.rssi;
    haveFilter = true;
    if (filteredRssi >= NEAR_RSSI) { nearCount = min(nearCount + 1, 3); farCount = 0; }
    else if (filteredRssi <= FAR_RSSI) { farCount = min(farCount + 1, 4); nearCount = 0; }
    else { nearCount = farCount = 0; }
    if (nearCount >= 3) { armed = true; state = Proximity::Near; }
    else if (armed && farCount >= 4) state = Proximity::Far;
  }
  if (armed && now - lastSample >= LOST_MS) {
    state = Proximity::Lost;
    haveFilter = false;
    nearCount = farCount = 0;
  }
}

void driveBuzzer(bool on) {
  if (!buzzerMode) return;
  const bool activeLow = buzzerMode == 1;
  digitalWrite(BUZZER_PIN, on ? (activeLow ? LOW : HIGH) : (activeLow ? HIGH : LOW));
}

void readBuzzerSetup(uint32_t now) {
  while (Serial.available()) {
    const char command = tolower(Serial.read());
    if (command == 'l' || command == 'h') {
      buzzerMode = command == 'l' ? 1 : 2;
      settings.putUChar("buzzer", buzzerMode);
      driveBuzzer(false);
      pinMode(BUZZER_PIN, OUTPUT);
      testingBuzzer = true;
      testStarted = now;
      Serial.println("Buzzer test: short beep, then silence expected.");
    } else if (command == 't' && buzzerMode) {
      testingBuzzer = true; testStarted = now;
    } else if (command == 'x') {
      driveBuzzer(false);
      buzzerMode = 0;
      settings.putUChar("buzzer", 0);
      pinMode(BUZZER_PIN, INPUT);
      testingBuzzer = false;
      Serial.println("Buzzer disabled. Disconnect its VCC before changing wires.");
    }
  }
  if (testingBuzzer && now - testStarted >= 300) testingBuzzer = false;
  const bool alarm = armed && (state == Proximity::Far || state == Proximity::Lost);
  driveBuzzer(testingBuzzer || (alarm && (now % 1000 < 250)));
}

bool missing(const char* value) { return !value[0] || strstr(value, "CHANGE_ME") || strstr(value, "YOUR_PC_IP"); }

void networkTask(void*) {
  if (missing(WIFI_SSID) || missing(WIFI_PASSWORD) || missing(REPORT_URL) || missing(REPORTER_TOKEN)) {
    Serial.println("Wi-Fi reporting needs config.h. BLE alarm can still work locally.");
    vTaskDelete(nullptr); return;
  }
  const String url(REPORT_URL);
  if (!url.startsWith("http://") || !url.endsWith("/api/proximity/reports") || strlen(REPORTER_TOKEN) < 32) {
    Serial.println("Check REPORT_URL and the BLE monitor token in config.h.");
    vTaskDelete(nullptr); return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Connecting to hotspot...");
  bool connectedBefore = false, pending = false, blocked = false, reported = false;
  uint32_t lastWifi = millis(), lastAttempt = 0, retryDelay = 0, lastClockNotice = millis();
  Report current{};
  for (;;) {
    const uint32_t now = millis();
    const bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !connectedBefore) {
      Serial.println("Hotspot connected.");
      configTime(0, 0, "pool.ntp.org", "time.google.com");
    }
    if (!connected && connectedBefore) Serial.println("Hotspot lost. Reconnecting...");
    connectedBefore = connected;
    if (!connected && now - lastWifi >= 20000) { lastWifi = now; WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); }
    clockReady.store(time(nullptr) >= 1704067200);
    if (connected && !clockReady.load() && now - lastClockNotice >= 30000) {
      lastClockNotice = now;
      Serial.println("Waiting for time. Keep phone mobile data on.");
    }
    // Keep the newest state. Outage history is not buffered or replayed as live data.
    Report newest;
    if (xQueueReceive(reports, &newest, 0) == pdTRUE) { current = newest; pending = true; }
    if (pending && connected && !blocked && now - lastAttempt >= retryDelay) {
      lastAttempt = now;
      const String payload = String("{\"eventId\":\"") + current.eventId + "\",\"tagId\":\"" + tagId
        + "\",\"observedAt\":\"" + current.observedAt + "\",\"state\":\"" + current.state
        + "\",\"rssi\":" + (current.hasRssi ? String(current.rssi) : String("null"))
        + ",\"buzzerEnabled\":" + (current.buzzerEnabled ? "true" : "false") + "}";
      WiFiClient client;
      HTTPClient http;
      http.setConnectTimeout(1500); http.setTimeout(2000);
      http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
      int status = -1;
      String response;
      if (http.begin(client, REPORT_URL)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", String("Bearer ") + REPORTER_TOKEN);
        status = http.POST(payload);
        if (http.getSize() >= 0 && http.getSize() <= 2048) response = http.getString();
      }
      http.end();
      if ((status == 200 || status == 201) && response.indexOf("\"success\":true") >= 0) {
        pending = false; retryDelay = 0;
        if (!reported) { Serial.println("Admin reporting connected."); reported = true; }
      } else if (status == 401 || status == 403 || status == 422) {
        Serial.println("BLE monitor credential rejected. Check config.h and upload again."); blocked = true;
      } else if (status == 400 || status == 409) {
        Serial.printf("Report rejected (%d). Check the clock/configuration.\n", status); pending = false;
      } else {
        if (reported || retryDelay == 0) Serial.println("Admin unavailable. Local alarm remains active.");
        reported = false; retryDelay = min<uint32_t>(retryDelay ? retryDelay * 2 : 2000, 15000);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void queueReport(uint32_t now, bool changed) {
  if (!clockReady.load() || (!changed && now - lastReport < REPORT_MS)) return;
  lastReport = now;
  Report report{};
  snprintf(report.eventId, sizeof(report.eventId), "%s:%010lu", bootId, static_cast<unsigned long>(++sequence));
  struct timeval tv; gettimeofday(&tv, nullptr);
  struct tm utc; gmtime_r(&tv.tv_sec, &utc);
  char seconds[21]; strftime(seconds, sizeof(seconds), "%Y-%m-%dT%H:%M:%S", &utc);
  snprintf(report.observedAt, sizeof(report.observedAt), "%s.%03ldZ", seconds, static_cast<long>(tv.tv_usec / 1000));
  strcpy(report.state, stateName(state));
  report.hasRssi = state == Proximity::Near || state == Proximity::Far;
  report.rssi = lroundf(filteredRssi);
  report.buzzerEnabled = buzzerMode != 0;
  xQueueOverwrite(reports, &report);
}

void setup() {
  Serial.begin(115200); delay(300);
  Serial.println("\nWithin Limits | BLE proximity + Wi-Fi");
  settings.begin("wl-proximity", false);
  buzzerMode = settings.getUChar("buzzer", 0);
  if (buzzerMode > 2) buzzerMode = 0;
  if (buzzerMode) { driveBuzzer(false); pinMode(BUZZER_PIN, OUTPUT); }
  else { pinMode(BUZZER_PIN, INPUT); Serial.println("Buzzer setup: send L for active-low or H for active-high; T tests it."); }
  const uint64_t chip = ESP.getEfuseMac();
  snprintf(tagId, sizeof(tagId), "WL-%04X%08lX", static_cast<unsigned int>((chip >> 32) & 0xFFFF), static_cast<unsigned long>(chip & 0xFFFFFFFF));
  BLEDevice::init(tagId);
  BLEDevice::setCustomGapHandler(gapEvent);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(&phoneCallbacks);
  server->advertiseOnDisconnect(true);
  BLEService* service = server->createService(SERVICE_UUID);
  service->createCharacteristic(TAG_ID_UUID, BLECharacteristic::PROPERTY_READ)->setValue(tagId);
  service->start();
  BLEAdvertisementData data, response;
  data.setFlags(0x06); data.setCompleteServices(BLEUUID(SERVICE_UUID)); response.setName(tagId);
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->setAdvertisementData(data); advertising->setScanResponseData(response);
  advertising->setMinInterval(0x00A0); advertising->setMaxInterval(0x00F0); advertising->start();
  uint8_t nonce[16]; esp_fill_random(nonce, sizeof(nonce));
  for (uint8_t i=0; i<sizeof(nonce); ++i) snprintf(bootId+2*i, 3, "%02x", nonce[i]);
  reports = xQueueCreate(1, sizeof(Report));
  if (!reports || xTaskCreate(networkTask, "wifi-report", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("Network task failed. Reset the board.");
  }
  Serial.print("BLE name: "); Serial.println(tagId);
  Serial.println("nRF Connect: connect to this name and keep the phone nearby to arm.");
}

void loop() {
  const uint32_t now = millis();
  const Proximity previous = state;
  const uint8_t previousMode = buzzerMode;
  updateProximity(now);
  readBuzzerSetup(now);
  if (state != previous) { Serial.print("Proximity: "); Serial.println(stateName(state)); }
  if (reports) queueReport(now, state != previous || previousMode != buzzerMode);
  delay(10);
}
