require("dotenv").config({ quiet: true });
const { pool, closeDatabase } = require("../config/database");
const { saveRoute } = require("../services/trackingService");
const { id } = require("../services/trackingValidation");

async function main() {
  const routeId = id(process.argv[2], "Demo route ID");
  const route = (await pool.query("SELECT * FROM monitoring_routes WHERE id=$1", [routeId])).rows[0];
  if (!route || !["Four-point demo route", "College RFID test route"].includes(route.name)) throw new Error("Choose the existing demo route. Other routes are left unchanged.");
  const points = (await pool.query("SELECT id FROM checkpoints WHERE route_id=$1 ORDER BY position,id", [routeId])).rows;
  if (points.length !== 4) throw new Error("The test route must have four checkpoints.");
  const names = ["College entrance", "Main block", "Library junction", "College exit"];
  const path = [[10,10],[65,10],[65,65],[10,65]];
  await saveRoute({ name: "College RFID test route", region: "College test circuit", revision:route.revision, autoEnroll:true, mapMode:"schematic", path,
    checkpoints: points.map((point,index) => ({ id:point.id,name:names[index],latitude:path[index][0],longitude:path[index][1] })) },routeId,{uid:route.owner_uid,role:"group_admin"});
  console.log(JSON.stringify({ routeId, name:"College RFID test route", mapMode:"schematic", checkpoints:points.map((point,index)=>({id:point.id,name:names[index],order:index+1})), note:"Four physical reader stations. The diagram shows walking order, not GPS coordinates. No people or scans were created." },null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closeDatabase);
