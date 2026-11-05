export default function DashboardHome({ data, onRoutes, onGroups, onHistory, onNewRoute, onOpenGroup }) {
  const people = data.groups.reduce((sum, group) => sum + group.members.length, 0);
  const completed = data.routes.reduce((sum, route) => sum + (route.completedGroups || 0), 0);
  return <div className="dashboard-home">
    <section className="home-welcome"><div><p className="eyebrow">YOUR MONITORING WORKSPACE</p><h2>Keep every group<br/>in view.</h2><p>Start a route, follow your groups, and find every completed journey in one place.</p><div className="home-actions"><button className="primary-button" onClick={onGroups}>View active groups <span aria-hidden="true">→</span></button><button className="quiet-button" onClick={() => onRoutes()}>Manage routes</button></div></div><div className="home-ready"><span className="home-ready-icon" aria-hidden="true">✓</span><h3>{data.groups.length ? "Monitoring in progress" : "Ready for your next test"}</h3><p>{data.groups.length ? `${people} people are being tracked across ${data.groups.length} active groups.` : "Choose a route, place your readers, and scan cards at the first checkpoint."}</p><span>Records move to History when everyone finishes.</span></div></section>
    <section className="home-stats" aria-label="Workspace summary">
      <button onClick={onGroups}><span>Active groups</span><strong>{data.groups.length}</strong><small>{people} people on a route</small></button>
      <button onClick={() => onRoutes()}><span>Saved routes</span><strong>{data.routes.length}</strong><small>{data.routes.reduce((sum, route) => sum + route.checkpoints.length, 0)} checkpoints configured</small></button>
      <button onClick={onHistory}><span>Completed groups</span><strong>{completed}</strong><small>Saved in route history</small></button>
    </section>
    <div className="home-panels"><section className="home-panel"><div className="home-panel-heading"><div><h2>Your routes</h2><p>Choose where the next journey starts.</p></div><button className="text-button" onClick={onNewRoute}>+ New route</button></div>
      {data.routes.length ? data.routes.map(route => <button className="home-route" key={route.id} onClick={() => onRoutes(route.id)}><span className="home-route-number">{route.checkpoints.length}</span><span><strong>{route.name}</strong><small>{route.region} · {route.checkpoints.length} checkpoints</small></span><span className="row-arrow" aria-hidden="true">→</span></button>) : <p className="home-empty">Create your first route and add checkpoints in walking order.</p>}
    </section><section className="home-panel"><div className="home-panel-heading"><div><h2>Active now</h2><p>Groups that still have a journey to finish.</p></div></div>
      {data.groups.length ? data.groups.slice(0, 5).map(group => <button className="home-route" key={group.id} onClick={() => onOpenGroup(group)}><span className="group-avatar">{group.name.slice(0,1)}</span><span><strong>{group.name}</strong><small>{group.members.length} active · {group.finishedMembers || 0} finished</small></span><span className="row-arrow" aria-hidden="true">→</span></button>) : <div className="home-empty"><span className="home-empty-icon" aria-hidden="true">◎</span><h3>No groups on a route</h3><p>Scan at the entrance for automatic registration, or add a named group from Groups.</p></div>}
      {data.groups.length > 5 && <button className="text-button" onClick={onGroups}>See all groups</button>}
    </section></div>
  </div>;
}
