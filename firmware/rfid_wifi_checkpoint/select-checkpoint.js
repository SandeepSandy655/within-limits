// Select a college checkpoint before uploading the reader sketch.
const fs = require("node:fs");
const path = require("node:path");

try {
  const checkpoint = process.argv[2];
  if (!["entrance", "main-block", "library", "exit"].includes(checkpoint)) throw new Error("Usage: node select-checkpoint.js entrance|main-block|library|exit");
  const configPath = path.join(__dirname, "config.h");
  const credentialPath = path.resolve(__dirname, "../../backend/.private/college-checkpoints", `${checkpoint}.json`);
  const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (credential.endpoint !== "/api/tracking/reports" || typeof credential.reporterId !== 'string' || typeof credential.token !== "string" || !/^[A-Za-z0-9_-]{32,300}$/.test(credential.token)) throw new Error("Invalid checkpoint credential.");
  const source = fs.readFileSync(configPath, "utf8");
  const declaration = /^static constexpr const char\* REPORTER_TOKEN\s*=\s*"[^"\r\n]*";\s*$/m;
  if (!declaration.test(source)) throw new Error("Cannot find the REPORTER_TOKEN declaration in config.h; no file was changed.");
  fs.writeFileSync(configPath, source.replace(declaration, () => `static constexpr const char* REPORTER_TOKEN = ${JSON.stringify(credential.token)};`));
  console.log(`config.h now uses the ${checkpoint} reader credential. Hotspot settings were preserved. Upload the sketch to apply it. The token was not printed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
