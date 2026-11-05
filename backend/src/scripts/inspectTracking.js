// Read-only support for a backend demonstration. No tokens or raw card IDs are printed.
require("dotenv").config({ quiet:true });
const { pool,closeDatabase } = require("../config/database");
const { id } = require("../services/trackingValidation");

async function main() {
  const routeId=process.argv[2] ? id(process.argv[2],"Route ID") : null;
  const routes=(await pool.query(`SELECT r.id,r.name,r.auto_enroll AS "autoEnroll",
    (SELECT COUNT(*)::int FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=r.id AND m.active) AS "activePeople",
    (SELECT COUNT(*)::int FROM tracked_groups g WHERE g.route_id=r.id AND g.completed_at IS NOT NULL) AS "completedGroups",
    (SELECT COUNT(*)::int FROM checkpoint_reports p WHERE p.route_id=r.id) AS scans
    FROM monitoring_routes r WHERE $1::uuid IS NULL OR r.id=$1 ORDER BY r.created_at`,[routeId])).rows;
  const checkpoints=(await pool.query(`SELECT c.route_id AS "routeId",c.id,c.position+1 AS stop,c.name,
    (SELECT COUNT(*)::int FROM checkpoint_reporters p WHERE p.checkpoint_id=c.id AND p.revoked_at IS NULL) AS readers
    FROM checkpoints c WHERE $1::uuid IS NULL OR c.route_id=$1 ORDER BY c.route_id,c.position`,[routeId])).rows;
  console.log(JSON.stringify({routes,checkpoints},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closeDatabase);
