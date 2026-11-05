require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, closeDatabase } = require('../config/database');
const { prepareCollegeDemo } = require('../services/collegeDemo');

async function main() {
  const routes = (await pool.query(`SELECT r.id,r.name,r.archived_at,
    (SELECT COUNT(*)::int FROM checkpoints WHERE route_id=r.id) AS checkpoints
    FROM monitoring_routes r ORDER BY r.created_at`)).rows;
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ routes, usage: 'node src/scripts/prepareCollegeDemo.js OLD_ROUTE_ID COLLEGE_ROUTE_ID --apply', note: 'Archives the old demo, releases its active cards and moves proximity devices to the college route. Existing visits remain stored.' }, null, 2));
    return;
  }
  const result = await prepareCollegeDemo(process.argv[2], process.argv[3], async (backup) => {
    const directory = path.resolve('.private/registration-backups');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `college-cutover-${Date.now()}.json`), JSON.stringify(backup, null, 2), { flag: 'wx' });
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
