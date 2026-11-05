const labels = { unseen: "Awaiting board", waiting: "Waiting for phone", near: "Nearby", far: "Beyond signal threshold", lost: "Phone signal lost", offline: "Reporting offline", revoked: "Disabled" };

export default function ProximityPanel({ route, monitors = [], formatTime, hidden }) {
  const selected = monitors.filter((monitor) => monitor.routeId === route?.id);
  return <section className="panel proximity-panel" hidden={hidden} aria-labelledby="proximity-heading">
    <div className="panel-heading"><div><h2 id="proximity-heading">BLE proximity <span className="count-pill">{selected.length}</span></h2><p className="section-description">Phone proximity and buzzer status reported by your ESP32.</p></div></div>
    {selected.length ? <div className="table-scroll" role="region" aria-label="BLE proximity status" tabIndex={0}><table><thead><tr><th scope="col">Device</th><th scope="col">Proximity</th><th scope="col">Buzzer</th><th scope="col">Last report</th></tr></thead><tbody>{selected.map((monitor) => <tr key={monitor.id}>
      <td><strong>{monitor.name}</strong><small className="released-card">{monitor.tagId || "Waiting for the first report"}</small></td>
      <td><span className={`proximity-status proximity-${monitor.status}`}>{labels[monitor.status] || "Unknown"}</span>{monitor.online && monitor.rssi !== null && <small className="released-card">Signal: {monitor.rssi} dBm</small>}</td>
      <td>{!monitor.online ? "Unknown" : !monitor.buzzerEnabled ? "Not configured" : monitor.alarm ? "Alarm active (reported)" : "Ready · silent"}</td>
      <td>{monitor.observedAt ? <time dateTime={monitor.observedAt}>{formatTime(monitor.observedAt)}</time> : "No report yet"}</td>
    </tr>)}</tbody></table></div> : <p className="arrivals-empty completed-empty">A configured BLE board will appear here when assigned to this route.</p>}
    <p className="detail-footnote">Keep the phone connected in nRF Connect for this test. Signal strength estimates proximity, not metres. Closing the connection can trigger signal loss. Reporting offline means the backend has no fresh update; the board may still sound its local alarm.</p>
  </section>;
}
