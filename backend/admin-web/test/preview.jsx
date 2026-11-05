// Development-only fixture. Never imported by the production entry point.
import { createRoot } from "react-dom/client";
import Dashboard from "../src/Dashboard";
import "../src/admin.css";
const cpIds = ["aad4d9ab-8687-45c7-8533-87f3e47d9761", "aad4d9ab-8687-45c7-8533-87f3e47d9762", "aad4d9ab-8687-45c7-8533-87f3e47d9763", "aad4d9ab-8687-45c7-8533-87f3e47d9764"];
const routeId = "d90bf6a1-1949-4c15-9d64-1404b2c0ce91";
const checkpoints = [["Main entrance", 12.9768, 77.5906], ["Garden junction", 12.9761, 77.5927], ["Library walk", 12.9750, 77.5939], ["South gate", 12.9725, 77.5927]].map(([name, latitude, longitude], i) => ({ id: cpIds[i], name, latitude, longitude }));
const now = new Date().toISOString();
const fixture = { success: true, generatedAt: now, staleAfterSeconds: 300,
  routes: [{ id: routeId, revision: 1, autoEnroll: true, name: "Garden trail", region: "Central park", checkpoints, path: checkpoints.map((cp) => [cp.latitude, cp.longitude]) }],
  groups: [
    { id: "group-a", routeId, name: "Morning explorers", leaderName: "Asha", status: "active", checkpointId: cpIds[1], completedCheckpoints: 1, lastSeen: now,
      members: ["Asha", "Kiran", "Neha", "Arun"].map((name, i) => ({ id: `member-${i}`, tagId: `DEMO000${i}`, name, lastSeen: now, status: "active", checkpointId: cpIds[i < 2 ? 1 : 0] })), visits: [{ checkpointId: cpIds[0], seen: 4 }, { checkpointId: cpIds[1], seen: 2 }] },
    { id: "group-b", routeId, name: "The trailblazers", leaderName: "Riya", status: "attention", checkpointId: cpIds[0], completedCheckpoints: 0, lastSeen: now,
      members: [{ id: "member-b", name: "Riya", status: "stale", checkpointId: cpIds[0], lastSeen: new Date(Date.now() - 600_000).toISOString() }, { id: "member-c", name: "Dev", status: "waiting", checkpointId: null, lastSeen: null }], visits: [{ checkpointId: cpIds[0], seen: 1 }] },
  ] };
const params = new URLSearchParams(location.search);
const completedSample = { id:"history-a",name:"Completed college group",routeId,routeName:"College route",region:"Campus",memberCount:2,completedAt:now,startedAt:now };
fixture.routes[0].completedGroups = 1;
const proximity = params.get("proximity");
if (proximity) {
  fixture.proximityMonitors = fixture.groups.flatMap((group) => group.members.map((member, index) => ({
    id: `board-${member.id}`, name: `Test device ${index + 1}`, routeId, groupId: group.id, memberId: member.id,
    status: index === 1 && ["short", "alert"].includes(proximity) ? "far" : "near",
    online: proximity !== "offline", assignmentFresh: true, observedAt: now, receivedAt: now,
    proximityAlert: index === 1 && proximity === "alert",
    outOfRangeSince: index === 1 && ["short", "alert"].includes(proximity) ? new Date(Date.now() - (proximity === "alert" ? 130000 : 45000)).toISOString() : null,
  })));
}
if (params.has("empty")) { fixture.routes = []; fixture.groups = []; }
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}) => {
  if (!String(url).startsWith("/api/admin")) return originalFetch(url, options);
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (params.has("error")) return response({ success: false, message: "Test connection failure." }, 503);
  if (options.method === 'PATCH' && String(url).startsWith('/api/admin/members/')) {
    const member = fixture.groups.flatMap(group => group.members).find(item => item.id === String(url).split('/').at(-1));
    if (!member) return response({ success: false, message: 'Assignment not found.' }, 404);
    member.name = JSON.parse(options.body).name;
    return response({ success: true, member });
  }
  if (String(url).startsWith("/api/admin/history")) {
    if (String(url).startsWith("/api/admin/history/history-a")) return response({ success:true,group:{...completedSample,route:{region:"Campus",checkpoints}},members:[{id:"history-member",name:"Test member",exitedAt:now}],scans:checkpoints.map((cp,i)=>({id:i,memberName:"Test member",checkpointName:cp.name,observedAt:now})) });
    const page = Number(new URL(String(url),location.origin).searchParams.get("page") || 1);
    return response({success:true,groups:page===1?[completedSample]:[{...completedSample,id:"older-group",name:"Earlier group"}],page,pageSize:20,total:21,totalPages:2});
  }
  if (String(url).endsWith("/registrations")) {
    const summary = { success: true, routeId, routeName: fixture.routes[0]?.name, cards: fixture.groups.reduce((n,g) => n + g.members.length, 0), groups: fixture.groups.length, checkpointVisits: 5, completedTrips: 0 };
    if (options.method === "DELETE") {
      if (JSON.parse(options.body).confirmRouteName !== summary.routeName) return response({ success: false, message: "Route name does not match." }, 400);
      fixture.groups = []; fixture.proximityMonitors = []; fixture.completedTrips = [];
      return response({ success: true, deleted: summary });
    }
    return response(summary);
  }
  if (options.method === "POST" || options.method === "PUT") {
    const body = JSON.parse(options.body);
    if (url === "/api/admin/groups") {
      const id = crypto.randomUUID();
      fixture.groups.push({ ...body, id, status: "waiting", completedCheckpoints: 0, visits: [], members: body.members.map((member) => ({ ...member, id: crypto.randomUUID(), status: "waiting" })) });
      return response({ success: true, id });
    }
    const id = body.id || crypto.randomUUID();
    fixture.routes = [...fixture.routes.filter((route) => route.id !== id), { ...body, id, revision: (body.revision || 0) + 1 }];
    return response({ success: true, id });
  }
  const updated = new Date().toISOString();
  if (proximity !== "offline") fixture.proximityMonitors?.forEach((monitor) => { monitor.observedAt = updated; monitor.receivedAt = updated; });
  return response({ ...fixture, generatedAt: updated });
};
const user = { getIdToken: async () => "ui-fixture-only" };
createRoot(document.getElementById("root")).render(<><div style={{ background: "#e8d5a6", padding: "6px", textAlign: "center", font: "11px sans-serif" }}>UI TEST FIXTURE · sample data · no production changes</div><Dashboard user={user} initialData={fixture} onSignOut={() => location.reload()}/></>);
