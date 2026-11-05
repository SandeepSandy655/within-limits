// Copy existing hotspot declarations privately; never print passwords or tokens.
const fs = require("node:fs");
const path = require("node:path");
try {
  const target = path.join(__dirname, "config.h");
  if (fs.existsSync(target)) throw new Error("config.h already exists; edit it locally to preserve your changes.");
  const source = fs.readFileSync(path.resolve(__dirname, "../rfid_wifi_checkpoint/config.h"), "utf8");
  const credential = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../backend/.private/ble-tag-1.json"), "utf8"));
  if (credential.endpoint !== "/api/proximity/reports" || credential.monitorId !== "ble-tag-1" || !/^[A-Za-z0-9_-]{32,300}$/.test(credential.token)) throw new Error("Invalid BLE monitor credential.");
  const declaration = (name) => {
    const match = source.match(new RegExp('^static constexpr const char\\* '+name+'\\s*=\\s*"(?:[^"\\\\\\r\\n]|\\\\.)*";','m'));
    if(!match) throw new Error(`Cannot read ${name} from the RFID configuration.`);
    return match[0];
  };
  const url = declaration("REPORT_URL").replace("/api/tracking/reports", "/api/proximity/reports");
  if(!url.includes("/api/proximity/reports")) throw new Error("RFID backend URL needs configuration.");
  fs.writeFileSync(target, ['#pragma once', '// Private local settings. Do not share this file.', declaration("WIFI_SSID"), declaration("WIFI_PASSWORD"), url, `static constexpr const char* REPORTER_TOKEN = ${JSON.stringify(credential.token)};`, ''].join('\n'), { flag: "wx" });
  console.log("BLE config.h created with the same phone hotspot and a separate BLE monitor token. No secrets printed.");
} catch(error) { console.error(error.message); process.exitCode=1; }
