#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <atomic>

// Within Limits BLE bench tag. Uses the ESP32's built-in Bluetooth radio.
// Uploading this standalone sketch replaces RFID/Wi-Fi firmware on this board.
// This advertises a device identity; it does not send checkpoint reports.
constexpr char SERVICE_UUID[] = "4f6c0001-b5a3-4f01-9f58-51f59c12a001";
constexpr char TAG_ID_UUID[]  = "4f6c0002-b5a3-4f01-9f58-51f59c12a001";

char tagId[16];  // "WL-" + 12 hexadecimal digits + null terminator.
std::atomic<bool> restartAdvertising{false};

class TagCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    Serial.println("Phone connected.");
  }

  void onDisconnect(BLEServer* server) override {
    // Restart from loop(), allowing the Bluetooth stack to finish disconnecting.
    restartAdvertising.store(true);
  }
};

TagCallbacks callbacks;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("Within Limits | BLE tag");

  // Stable for this board across resets; does not claim an RFID/person identity.
  const uint64_t chipId = ESP.getEfuseMac();
  snprintf(tagId, sizeof(tagId), "WL-%04X%08lX",
           static_cast<unsigned int>((chipId >> 32) & 0xFFFF),
           static_cast<unsigned long>(chipId & 0xFFFFFFFF));

  BLEDevice::init(tagId);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(&callbacks);

  BLEService* service = server->createService(SERVICE_UUID);
  BLECharacteristic* identity = service->createCharacteristic(
    TAG_ID_UUID, BLECharacteristic::PROPERTY_READ);
  identity->setValue(tagId);
  service->start();

  // Keep the 128-bit service UUID in the main packet so scanners can filter it.
  // Put the complete device name in the scan response to fit the 31-byte limit.
  BLEAdvertisementData advertisement;
  advertisement.setFlags(0x06);  // General discoverable, Bluetooth LE only.
  advertisement.setCompleteServices(BLEUUID(SERVICE_UUID));
  BLEAdvertisementData scanResponse;
  scanResponse.setName(tagId);

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->setAdvertisementData(advertisement);
  advertising->setScanResponseData(scanResponse);
  advertising->setMinInterval(0x00A0);  // 100 ms (units of 0.625 ms).
  advertising->setMaxInterval(0x00F0);  // 150 ms.
  advertising->start();

  Serial.print("BLE name: ");
  Serial.println(tagId);
  Serial.println("Ready. Scan using a BLE scanner app.");
}

void loop() {
  if (restartAdvertising.exchange(false)) {
    delay(150);
    BLEDevice::startAdvertising();
    Serial.println("Disconnected. Ready to scan again.");
  }
  delay(20);
}
