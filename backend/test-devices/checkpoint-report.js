// Sends one real test observation. This is not automatically loaded by the dashboard.
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
async function main() {
  const [configPath, tagId, eventId = randomUUID(), observedAt = new Date().toISOString()] = process.argv.slice(2);
  if (!configPath || !tagId || !process.env.TRACKING_API_URL) throw new Error("Set TRACKING_API_URL, then run: node test-devices/checkpoint-report.js <private-config.json> <tagId> [eventId] [observedAt]");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const response = await fetch(new URL(config.endpoint, process.env.TRACKING_API_URL), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ eventId, tagId, observedAt }), signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, eventId, observedAt, ...result }, null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
