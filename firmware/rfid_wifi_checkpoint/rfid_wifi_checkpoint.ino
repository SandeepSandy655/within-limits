#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include <time.h>

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

// Same wiring as the tested Stage 1 sketch. RC522 power stays at 3.3V.
constexpr byte SS_PIN = 5, RST_PIN = 21, SCK_PIN = 18, MISO_PIN = 19, MOSI_PIN = 23;
constexpr uint32_t COOLDOWN_MS = 5000, WIFI_RETRY_MS = 20000;
constexpr byte QUEUE_SIZE = 16, RECENT_SIZE = 8;
MFRC522 rfid(SS_PIN, RST_PIN);

struct Observation {
  char tagId[21];
  char eventId[48];
  char observedAt[25];
};
struct RecentCard { char tagId[21]; uint32_t scannedAt; bool used; };
Observation pending[QUEUE_SIZE];
RecentCard recent[RECENT_SIZE] = {};
byte queueHead = 0, queueCount = 0, recentSlot = 0, failures = 0;
char bootId[33];
uint32_t sequence = 0, lastWifiAttempt = 0, lastClockNotice = 0, retryStarted = 0, retryDelay = 0;
bool configured = false, readerReady = false, wasConnected = false, clockReady = false, reportingBlocked = false;

bool placeholder(const char* value) {
  return !value[0] || strstr(value, "CHANGE_ME") || strstr(value, "YOUR_PC_IP");
}

bool checkConfiguration() {
  bool valid = true;
  if (placeholder(WIFI_SSID) || strlen(WIFI_SSID) > 32) {
    Serial.println("Set WIFI_SSID in config.h to your hotspot name (1-32 bytes).");
    valid = false;
  }
  if (placeholder(WIFI_PASSWORD) || strlen(WIFI_PASSWORD) < 8 || strlen(WIFI_PASSWORD) > 63) {
    Serial.println("Set WIFI_PASSWORD in config.h to your hotspot password (8-63 characters).");
    valid = false;
  }
  const String url(REPORT_URL);
  if (placeholder(REPORT_URL) || !url.startsWith("http://") || !url.endsWith("/api/tracking/reports")) {
    Serial.println("Set REPORT_URL in config.h to http://YOUR_PC_IP:5000/api/tracking/reports.");
    valid = false;
  }
  if (placeholder(REPORTER_TOKEN) || strlen(REPORTER_TOKEN) < 32) {
    Serial.println("Set REPORTER_TOKEN in config.h to your provisioned reader token.");
    valid = false;
  }
  if (!valid) Serial.println("Save config.h, then upload the sketch again.");
  return valid;
}

void connectHotspot() {
  lastWifiAttempt = millis();
  Serial.println("Connecting to hotspot...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nWithin Limits | RFID Wi-Fi checkpoint");
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfid.PCD_Init();
  delay(100);
  const byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  readerReady = version != 0x00 && version != 0xFF;
  if (!readerReady) Serial.println("RFID not responding. Disconnect power and check the wiring.");

  configured = checkConfiguration();
  if (!configured) return;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  connectHotspot();
  // Wi-Fi is started before requesting a random per-boot event namespace.
  uint8_t nonce[16];
  esp_fill_random(nonce, sizeof(nonce));
  for (byte i = 0; i < sizeof(nonce); ++i) snprintf(bootId + 2 * i, 3, "%02x", nonce[i]);
}

void maintainConnection() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.println("Wi-Fi connected.");
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    lastClockNotice = millis();
  } else if (!connected && wasConnected) {
    Serial.println("Wi-Fi lost. Reconnecting...");
  }
  wasConnected = connected;
  if (!connected && millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
    WiFi.disconnect();
    connectHotspot();
  }
  const time_t now = time(nullptr);
  if (!clockReady && now >= 1704067200) {
    clockReady = true;
    if (readerReady) Serial.println("Ready. Tap a card.");
  } else if (!clockReady && millis() - lastClockNotice >= 30000) {
    lastClockNotice = millis();
    Serial.println("Waiting for time. Check the phone's mobile data.");
  }
}

bool recentlyScanned(const char* tagId) {
  for (byte i = 0; i < RECENT_SIZE; ++i) {
    if (recent[i].used && millis() - recent[i].scannedAt >= COOLDOWN_MS) recent[i].used = false;
    if (recent[i].used && strcmp(recent[i].tagId, tagId) == 0) return true;
  }
  return false;
}

void scanCard() {
  if (!readerReady || !rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  char tagId[21] = {};
  const byte size = rfid.uid.size;
  if (size == 4 || size == 7 || size == 10) {
    for (byte i = 0; i < size; ++i) snprintf(tagId + 2 * i, 3, "%02X", rfid.uid.uidByte[i]);
  }
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  if (!tagId[0]) { Serial.println("Unsupported UID length; scan ignored."); return; }
  if (reportingBlocked) { Serial.println("Reader token rejected. Fix config.h and upload again."); return; }
  if (recentlyScanned(tagId)) return;
  if (!clockReady) { Serial.println("Not ready. Wait for 'Ready', then scan again."); return; }
  if (queueCount == QUEUE_SIZE) { Serial.println("Queue full. Restore the connection, then scan again."); return; }

  Observation& event = pending[(queueHead + queueCount) % QUEUE_SIZE];
  strcpy(event.tagId, tagId);
  snprintf(event.eventId, sizeof(event.eventId), "%s:%lu", bootId, static_cast<unsigned long>(++sequence));
  time_t now = time(nullptr);
  struct tm utc;
  gmtime_r(&now, &utc);
  strftime(event.observedAt, sizeof(event.observedAt), "%Y-%m-%dT%H:%M:%SZ", &utc);
  ++queueCount;
  strcpy(recent[recentSlot].tagId, tagId);
  recent[recentSlot].scannedAt = millis();
  recent[recentSlot].used = true;
  recentSlot = (recentSlot + 1) % RECENT_SIZE;
  Serial.print("Card read: "); Serial.println(tagId);
}

void removeFirst() {
  queueHead = (queueHead + 1) % QUEUE_SIZE;
  --queueCount;
  failures = 0;
  retryDelay = 0;
}

void sendPending() {
  if (!queueCount || reportingBlocked || WiFi.status() != WL_CONNECTED || millis() - retryStarted < retryDelay) return;
  const Observation& event = pending[queueHead];
  // All payload values come from bounded hex/UTC formatting, not free-form text.
  const String payload = String("{\"eventId\":\"") + event.eventId + "\",\"tagId\":\"" + event.tagId + "\",\"observedAt\":\"" + event.observedAt + "\"}";
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(2000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  int status = -1;
  String response;
  if (http.begin(client, REPORT_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + REPORTER_TOKEN);
    status = http.POST(payload);
    if (status == 200 || status == 201) response = http.getString();
    http.end();
  }
  // Express emits compact JSON. A success status without its acknowledgement is retried.
  if ((status == 201 || status == 200) && response.indexOf("\"success\":true") >= 0) {
    Serial.print("Saved to admin: "); Serial.println(event.tagId);
    removeFirst();
  } else if (status == 401 || status == 403) {
    reportingBlocked = true;
    Serial.println("Reader token rejected. Fix config.h, upload and scan again.");
  } else if (status >= 400 && status < 500 && status != 408 && status != 429) {
    Serial.print("Not saved: "); Serial.print(event.tagId); Serial.print(" (HTTP "); Serial.print(status); Serial.println(")");
    if (status == 422) Serial.println("Check the card's member and route assignment in admin.");
    else if (status == 400) Serial.println("Check the clock and report format.");
    else if (status == 409) Serial.println("Event identity conflict. Restart the board, then rescan.");
    else Serial.println("Check REPORT_URL and backend configuration.");
    removeFirst();
  } else {
    retryDelay = 1000UL << (failures < 5 ? failures : 5);
    if (retryDelay > 30000) retryDelay = 30000;
    if (failures < 5) ++failures;
    retryStarted = millis();
    Serial.print("Not saved yet (code "); Serial.print(status);
    Serial.print("). Retrying in "); Serial.print(retryDelay / 1000); Serial.println("s.");
  }
}

void loop() {
  if (!configured) { delay(100); return; }
  maintainConnection();
  scanCard();
  sendPending();
  delay(5);
}
