#pragma once
// Local config.h is ignored by Git. configure-from-rfid.js prepares it privately.
static constexpr const char* WIFI_SSID = "CHANGE_ME_HOTSPOT_NAME";
static constexpr const char* WIFI_PASSWORD = "CHANGE_ME_HOTSPOT_PASSWORD";
static constexpr const char* REPORT_URL = "http://YOUR_PC_IP:5000/api/proximity/reports";
// This is a separate BLE monitor token, not an RFID checkpoint token.
static constexpr const char* REPORTER_TOKEN = "CHANGE_ME_PROXIMITY_TOKEN";
