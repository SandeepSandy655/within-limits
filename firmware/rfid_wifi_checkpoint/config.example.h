#pragma once

// Copy to config.h for your local setup. config.h is ignored by Git.
// During the assisted setup, config.h is already created with your reader token.
static constexpr const char* WIFI_SSID = "CHANGE_ME_HOTSPOT_NAME";
static constexpr const char* WIFI_PASSWORD = "CHANGE_ME_HOTSPOT_PASSWORD";
// The PC's Wi-Fi IPv4 address on the SAME phone hotspot. Not localhost.
static constexpr const char* REPORT_URL = "http://YOUR_PC_IP:5000/api/tracking/reports";
static constexpr const char* REPORTER_TOKEN = "CHANGE_ME_CHECKPOINT_READER_TOKEN";
