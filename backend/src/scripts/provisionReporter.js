require("dotenv").config({ quiet: true });
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pool, connectDatabase, closeDatabase, withTransaction } = require("../config/database");
const { hashToken } = require("../services/trackingService");
const { text, id, InputError } = require("../services/trackingValidation");

async function main() {
  const args = process.argv.slice(2);
  const value = (key) => args[args.indexOf(key) + 1];
  if (!args.includes("--id") || (!args.includes("--revoke") && (!args.includes("--checkpoint") || !args.includes("--output")))) {
    throw new InputError("Usage: npm run tracking:provision -- --id entrance-reader --checkpoint <checkpoint-uuid> --output <new-private-file.json> [--rotate]\nRevoke: npm run tracking:provision -- --id entrance-reader --revoke");
  }
  const reporterId = text(value("--id"), "Reporter ID", 100);
  await connectDatabase();
  if (args.includes("--revoke")) {
    const result = await pool.query("UPDATE checkpoint_reporters SET revoked_at = NOW() WHERE id = $1 RETURNING id", [reporterId]);
    if (!result.rowCount) throw new InputError("Reporter not found.");
    console.log("Reporting credential revoked.");
    return;
  }
  const checkpointId = id(value("--checkpoint"), "Checkpoint ID");
  const token = randomBytes(32).toString("base64url");
  const output = path.resolve(value("--output"));
  const file = await fs.open(output, "wx", 0o600);
  try {
    await withTransaction(async (client) => {
      const checkpoint = await client.query("SELECT id FROM checkpoints WHERE id = $1 FOR SHARE", [checkpointId]);
      if (!checkpoint.rowCount) throw new InputError("Checkpoint not found. Save the route in the admin page first.");
      if (args.includes("--rotate")) {
        const result = await client.query("UPDATE checkpoint_reporters SET token_hash = $2, revoked_at = NULL WHERE id = $1 AND checkpoint_id = $3 RETURNING id", [reporterId, hashToken(token), checkpointId]);
        if (!result.rowCount) throw new InputError("Reporter not found at this checkpoint. A reporter cannot be moved to a different checkpoint.");
      } else {
        await client.query("INSERT INTO checkpoint_reporters (id, checkpoint_id, token_hash) VALUES ($1,$2,$3)", [reporterId, checkpointId, hashToken(token)]);
      }
      await file.writeFile(JSON.stringify({ reporterId, checkpointId, token, endpoint: "/api/tracking/reports" }, null, 2) + "\n");
      await file.sync();
    });
    console.log(`Credential saved to ${output}. Keep this file private; the token is not printed.`);
  } catch (error) {
    await file.close();
    await fs.unlink(output);
    if (error.code === "23505") throw new InputError("Reporter already exists. Use --rotate with a new output file to replace its credential.");
    throw error;
  } finally { await file.close().catch(() => {}); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
