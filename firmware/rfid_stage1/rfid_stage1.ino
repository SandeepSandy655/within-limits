#include <SPI.h>
#include <MFRC522.h>

// Matches the user's working SPI wiring. These are GPIO numbers.
constexpr byte RFID_SS_PIN = 5;
constexpr byte RFID_RST_PIN = 21;
constexpr byte RFID_SCK_PIN = 18;
constexpr byte RFID_MISO_PIN = 19;
constexpr byte RFID_MOSI_PIN = 23;

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
bool readerReady = false;

// MFRC522 UIDs contain at most 10 bytes: 20 hex characters plus '\0'.
char tagId[21];

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("Within Limits | RFID stage 1 | serial only");

  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_SS_PIN);
  rfid.PCD_Init();
  delay(100);
  rfid.PCD_DumpVersionToSerial();

  const byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.println("Reader communication failed. Disconnect USB before checking wiring.");
    Serial.println("Check 3.3V, GND, SS=5, RST=21, SCK=18, MISO=19, MOSI=23.");
    Serial.println("Reconnect USB and reset the board after fixing the connection.");
    return;
  }

  readerReady = true;
  Serial.println("Ready. Tap one card; remove it before tapping again.");
  Serial.println("tagId uses uppercase hex, two digits per byte, without spaces.");
}

void loop() {
  if (!readerReady) {
    delay(100);
    return;
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(5);
    return;
  }

  if (rfid.uid.size == 0 || rfid.uid.size > 10) {
    Serial.println("Unexpected UID length; scan ignored.");
  } else {
    const char hex[] = "0123456789ABCDEF";
    for (byte i = 0; i < rfid.uid.size; ++i) {
      tagId[2 * i] = hex[rfid.uid.uidByte[i] >> 4];
      tagId[2 * i + 1] = hex[rfid.uid.uidByte[i] & 0x0F];
    }
    tagId[2 * rfid.uid.size] = '\0';

    Serial.print("tagId=");
    Serial.print(tagId);
    Serial.print(" | uidBytes=");
    Serial.print(rfid.uid.size);
    Serial.print(" | cardType=");
    Serial.println(rfid.PICC_GetTypeName(rfid.PICC_GetType(rfid.uid.sak)));
  }

  // End this card session. This is not a timed duplicate-scan filter.
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
