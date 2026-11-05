export function latestArrivals(route, groups, limit = 8, completedTrips = []) {
  if (!route) return [];
  const completed = completedTrips.filter((trip) => trip.routeId === route.id && Number.isFinite(Date.parse(trip.exitedAt)))
    .map((trip) => ({ ...trip, observedAt: trip.exitedAt, exited: true }));
  const completedIds = new Set(completed.map((trip) => trip.memberId));
  const active = groups.filter((group) => group.routeId === route.id).flatMap((group) =>
    group.members.flatMap((member) => {
      const checkpoint = route.checkpoints.find((point) => point.id === member.checkpointId);
      if (completedIds.has(member.id) || !checkpoint || !member.lastSeen || !Number.isFinite(Date.parse(member.lastSeen))) return [];
      return [{ memberId: member.id, memberName: member.name, groupId: group.id, groupName: group.name,
        checkpointId: checkpoint.id, checkpointName: checkpoint.name, observedAt: member.lastSeen,
        registered: Boolean(route.autoEnroll && checkpoint.id === route.checkpoints[0]?.id && member.tripStartedAt && Date.parse(member.tripStartedAt) === Date.parse(member.lastSeen)),
        incompleteExit: Boolean(route.autoEnroll && checkpoint.id === route.checkpoints.at(-1)?.id) }];
    })
  );
  return [...active, ...completed].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.memberId.localeCompare(b.memberId)).slice(0, limit);
}
