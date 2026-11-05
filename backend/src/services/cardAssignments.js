const { withTransaction } = require('../config/database');
const { id, InputError } = require('./trackingValidation');

async function renameCardHolder(memberId, name, admin) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new InputError('Enter a card holder name between 1 and 100 characters.');
  return withTransaction(async (client) => {
    const member = (await client.query(`SELECT m.id, g.route_id FROM tracking_members m
      JOIN tracked_groups g ON g.id=m.group_id JOIN monitoring_routes r ON r.id=g.route_id
      WHERE m.id=$1 AND m.active AND r.archived_at IS NULL AND ($2='super_admin' OR r.owner_uid=$3)`, [id(memberId, 'Member ID'), admin.role, admin.uid])).rows[0];
    if (!member) throw new InputError('Active card assignment not found.', 404);
    await client.query('SELECT id FROM monitoring_routes WHERE id=$1 FOR UPDATE', [member.route_id]);
    const changed = await client.query('UPDATE tracking_members SET name=$2 WHERE id=$1 AND active RETURNING id,name', [member.id, name.trim()]);
    if (!changed.rowCount) throw new InputError('This trip has already ended. Refresh the card list.', 409);
    return { success: true, member: changed.rows[0] };
  });
}
module.exports = { renameCardHolder };
