const { withTransaction } = require('../config/database');
const { id, InputError } = require('./trackingValidation');

async function prepareCollegeDemo(oldId, collegeId, beforeApply) {
  id(oldId, 'Old route ID'); id(collegeId, 'College route ID');
  if (oldId === collegeId) throw new InputError('Choose two different routes.');
  return withTransaction(async (client) => {
    const routes = (await client.query('SELECT * FROM monitoring_routes WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[oldId, collegeId]])).rows;
    const old = routes.find((route) => route.id === oldId), college = routes.find((route) => route.id === collegeId);
    if (!old || !college || old.owner_uid !== college.owner_uid || old.name !== 'RFID test route' || !/^College.*route$/i.test(college.name) || college.archived_at) throw new InputError('Select the old RFID test route and its owner’s college route.');
    const checkpoints = (await client.query('SELECT * FROM checkpoints WHERE route_id=ANY($1::uuid[]) ORDER BY route_id,position,id', [[oldId, collegeId]])).rows;
    if (checkpoints.filter((point) => point.route_id === oldId).length !== 2 || checkpoints.filter((point) => point.route_id === collegeId).length !== 4) throw new InputError('Expected the old two-stop demo and four-stop college route.');
    if (old.archived_at) return { success: true, alreadyPrepared: true, collegeRouteId: collegeId };
    const groups = (await client.query('SELECT * FROM tracked_groups WHERE route_id=$1', [oldId])).rows;
    const members = (await client.query('SELECT m.* FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=$1', [oldId])).rows;
    const monitors = (await client.query('SELECT * FROM proximity_monitors WHERE route_id=$1 ORDER BY id FOR UPDATE', [oldId])).rows;
    if (beforeApply) await beforeApply({ routes, checkpoints, groups, members, monitors });
    await client.query('UPDATE tracking_members m SET active=FALSE FROM tracked_groups g WHERE m.group_id=g.id AND g.route_id=$1 AND m.active', [oldId]);
    await client.query('UPDATE proximity_monitors SET route_id=$2,member_id=NULL,assigned_at=NULL,out_of_range_since=NULL,reports_cleared_at=clock_timestamp() WHERE route_id=$1', [oldId, collegeId]);
    await client.query('UPDATE monitoring_routes SET archived_at=clock_timestamp(),auto_enroll=FALSE,revision=revision+1 WHERE id=$1', [oldId]);
    await client.query('UPDATE monitoring_routes SET auto_enroll=TRUE,revision=revision+1 WHERE id=$1', [collegeId]);
    return { success: true, collegeRouteId: collegeId, archivedRouteId: oldId, releasedCards: members.filter((member) => member.active).length, movedMonitors: monitors.length };
  });
}
module.exports = { prepareCollegeDemo };
