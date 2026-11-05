// Presence summaries require current evidence for every active member.
export const proximityLabels = {
  near: "In range", far: "Out of range", lost: "Signal lost", offline: "No current report",
  waiting: "Waiting for phone", unseen: "Waiting for board", unlinked: "No board linked",
  awaiting: "Waiting for new report", revoked: "Board disabled",
};

export function groupProximity(group, monitors = [], now = Date.now()) {
  const assigned = new Map(monitors.filter((item) => item.routeId === group?.routeId && item.groupId === group?.id && item.memberId).map((item) => [item.memberId, item]));
  const members = (group?.members || []).map((member) => {
    const monitor = assigned.get(member.id);
    let status = "unlinked";
    if (monitor) {
      const fresh = monitor.online && Number.isFinite(Date.parse(monitor.observedAt)) && Number.isFinite(Date.parse(monitor.receivedAt))
        && now - Date.parse(monitor.observedAt) <= 30_000 && now - Date.parse(monitor.receivedAt) <= 30_000;
      status = monitor.revokedAt ? "revoked" : !monitor.assignmentFresh ? "awaiting" : !fresh ? "offline" : monitor.status;
      if (!(status in proximityLabels)) status = "awaiting";
    }
    const alert = ["far", "lost"].includes(status) && monitor?.proximityAlert === true;
    return { ...member, monitor, proximity: status, label: proximityLabels[status], alert };
  });
  const near = members.filter((member) => member.proximity === "near").length;
  const missing = members.filter((member) => ["far", "lost"].includes(member.proximity)).length;
  const unknown = members.length - near - missing;
  const linked = members.filter((member) => member.monitor).length;
  const together = members.length > 0 && near === members.length;
  const alerts = members.filter((member) => member.alert).length;
  return { members, near, missing, unknown, linked, alerts, total: members.length, together,
    mood: alerts ? "alert" : together ? "together" : "pending",
    title: alerts ? "Check on your group" : together ? "Everyone is in range" : missing ? "Waiting for members to return" : "Proximity not yet confirmed" };
}

export function groupAlerts(groups, monitors, now = Date.now()) {
  return groups.flatMap((group) => groupProximity(group, monitors, now).members
    .filter((member) => member.alert).map((member) => ({ group, member })));
}
