# Within-Limits: Progress and Future Roadmap

**Project:** Within-Limits
**Document status:** Planning note
**Last updated:** 22 October 2026

> This document records the current software prototype and future work. A starter admin monitoring page and PostgreSQL/Docker backend setup have been added. ESP32/BLE/RFID hardware, firmware telemetry, subscription integration, and production deployment remain future work. MongoDB-to-PostgreSQL data copying is prepared but still needs Docker to be running and the import to be completed.

## 1. Project purpose

Within-Limits is intended to help a group leader monitor a group using a mobile app and, in the future, connected IoT tags/devices. The current prototype focuses on app-to-app pairing and location sharing. The planned real-world version adds ESP32/BLE/RFID hardware, proximity and geofence behavior, an admin web app, subscriptions, and eventually deployment and monitoring.

##  2. Progress in the current workspace

The repository currently contains:

- **Mobile app:** React Native with Expo and Expo Router.
- **Backend:** Node.js/Express REST API and Socket.IO for live events.
- **Database:** Backend code now uses PostgreSQL with a relational schema for devices, connections, and location history. MongoDB is retained as the migration source until its records are copied and checked.
- **Device registration and pairing:** Mobile devices register with the backend, receive an eight-digit connection code, and can connect through code or QR scan. Connection requests have accept/reject and disconnect flows.
- **Group roles and limit:** The connection service enforces a host/linked-device relationship and a maximum of four linked devices per host.
- **Location sharing:** The app reports phone location, and the backend stores current location plus location history. The shared map uses OpenStreetMap tiles in a WebView.
- **Distance and nearby lookup:** The connections screen calculates a GPS-based distance. The backend has a nearby-device endpoint with a default search radius and accepts a radius parameter.
- **Buzzer:** A connected app can send a real-time buzzer event to another online app. This is an app notification; it does not yet drive a physical buzzer.
- **QR pairing UI:** A host can display a QR code and another device can scan it.
- **Admin monitoring page:** A separate page at `/admin` shows accepted host/linked groups from the existing mobile app records, a map, GPS distance/radius status, device status/last-seen, periodic refresh, and a mobile-app buzzer action. Its overview and buzzer endpoints require a backend `ADMIN_API_KEY`.



### Current scope limits to keep visible

- No ESP32 firmware, BLE tag scanning, RFID reader/tag integration, or physical buzzer is present yet.
- The admin page is a prototype for current mobile app groups. It does not yet identify tag-enabled groups, show ESP32/BLE/RFID telemetry, manage tags, or connect subscription entitlements. If payment is already implemented elsewhere, connect its verified subscription status to backend entitlements rather than duplicating payment collection.
- Full user-account authentication and production-grade authorization are not evident in the current implementation. Treat current device IDs and pairing codes as prototype mechanisms until identity and device security are designed.
- Nearby search radius exists in the backend, but a complete group geofence with a chosen center, enter/exit states, alert rules, and boundary behavior is still future work.
- The PostgreSQL schema and an idempotent MongoDB copy script are ready. The actual source records have not yet been copied; verify the migration preflight and record counts before switching the app to the new database.



## 3. Recommended order of future work

The app prototype is the completed Phase 1 baseline. The newly listed hardware work should happen before a production release. Keep the original deployment/publishing/monitoring/report work as the final release phase.

### Step 1 — Freeze requirements and system boundaries

Write down the intended behavior before selecting parts:

- Which people wear/hold tags, and which device is the group leader's gateway?
- Does the system need to work when phones have no internet or cellular coverage?
- What does “within the radius” mean: distance from the leader, distance from a fixed location, or distance between each participant and the leader?
- What should happen when a location is stale, inaccurate, or unavailable?
- What range, battery life, weather resistance, cost, and expected number of tags are required?
- Which events should the admin see, and what can the admin do with group data?

Decide early whether the first field prototype is **checkpoint based** (RFID readers at known places), **proximity based** (BLE), or combines both. GPS remains the source for map coordinates in the first hardware prototype.

### Step 2 — Select and prototype the hardware

Start with a small bench prototype rather than buying a full group set:

- One or two ESP32 development boards to evaluate scanning, connectivity, power, and event reporting.
- BLE advertiser/tag devices to represent participants; use ESP32 BLE advertising for an initial low-cost prototype if suitable.
- One RFID reader and a few tags for a checkpoint demonstration.
- A battery/power-management setup, charging method, enclosure, and mounting method for a wearable or carried device.
- Optional physical buzzer, status LED, and a button for pairing/help/SOS behavior.

Choose the RFID system only after defining how far away a checkpoint must detect a tag. Passive tags get their operating energy from the reader; active tags have their own power source and transmit. Their cost, maintenance, reader compatibility, and read behavior differ, so test the specific reader/tag combination in the intended environment. [GS1: active and passive tag differences](https://support.gs1.org/support/solutions/articles/43000733398-what-is-the-difference-between-passive-and-active-tags-)

Treat BLE RSSI as a filtered **near / far / signal lost** estimate at first, not an exact distance measurement. Signal strength changes with walls, bodies, orientation, and surroundings. [Bluetooth SIG: proximity and RSSI](https://www.bluetooth.com/blog/proximity-and-rssi/)

### Step 3 — Define the device-to-cloud data path and write firmware

Design a clear path from tag to app:

1. A tag advertises an identifier or is scanned by an RFID reader.
2. An ESP32/gateway records the event, signal strength, reader/checkpoint ID, timestamp, and device health information.
3. The gateway sends authenticated events to the backend when a network is available.
4. The backend validates and stores the event, updates last-seen/proximity state, and publishes changes to authorized mobile/admin clients.

Before implementation, choose the firmware-to-backend protocol. MQTT over TLS is a candidate for device telemetry; HTTPS is a candidate for simpler request/response or provisioning. The current backend uses REST and Socket.IO for the mobile app; it does not yet expose a hardware telemetry protocol. If ESP32 uses Wi-Fi and BLE at the same time, test scan timing and event latency because the radio is shared and schedules the work between them. [Espressif: ESP32 Wi-Fi/Bluetooth coexistence](https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32/api-guides/coexist.html)

If the product must report locations where there is no internet/cellular service, decide on an additional backhaul or relay design. BLE and RFID can identify nearby tags or checkpoint visits, but they do not by themselves deliver those events to a remote backend.

### Step 4 — Add backend support for hardware and group radius

Plan backend concepts and API contracts before writing firmware against them:

- A registered hardware device with a stable hardware ID, type, firmware version, owner/group association, and revocable device credential.
- Telemetry fields such as `deviceId`, `tagId`, `gatewayId`, `eventType`, `timestamp`, `rssi`, `batteryLevel`, `checkpointId`, and `firmwareVersion` where applicable.
- Last-seen/online state and a clear stale-data timeout.
- A group geofence configuration: center or leader-relative rule, radius in meters, who may change it, and enter/exit alert behavior.
- A rule for GPS accuracy and stale coordinates so an uncertain point does not trigger misleading boundary alerts.
- Access control so a host/admin can only read the groups they are allowed to manage.
- Retention limits and deletion rules for precise location history.

Avoid treating an 8-digit pairing code as a hardware secret. Use per-device credentials, TLS, revocation, and authorization checks for production device connections.

### Step 5 — Implement device registration and pairing for real tags

Keep app pairing and hardware identity as related but distinct concepts. Create a secure enrollment flow that binds a physical tag/ESP32 to a person or group, confirms ownership, supports replacement/revocation, and prevents a copied tag ID from silently taking over another device. Decide how a leader assigns tags and how a lost tag is removed.

### Step 6 — Extend the admin web app and connect subscription management

The admin web app scope is limited to groups using the physical tags and their leader. It should not become a dashboard for peer-to-peer groups that do not use the tags.

The first monitoring page exists at `/admin`. It currently uses a shared backend admin key for this development prototype. Extend it with:

- Admin sign-in, roles, and audit history.
- Group and leader management, linked tag inventory, and tag activation/revocation.
- Group map and last-seen/proximity/checkpoint status for tag-enabled groups only.
- Subscription plans, active/expired state, entitlement limits, payment confirmation, and renewal/cancellation handling.
- Server-side checks that apply subscription entitlements; do not trust a mobile UI flag to grant extra devices or features.
- Clear separation between the payment provider and the app's subscription records. Select a provider after confirming target country, currencies, and required payment methods.



### Step 7 — Validate the system with real devices

Test in stages: bench test, two-device test, four-device group test, then a realistic field trial. Record measurable acceptance criteria before the field trial:

- BLE detection and false near/far transitions at expected distances.
- RFID checkpoint read success rate in expected orientations and crowd conditions.
- Location freshness, GPS accuracy, event delivery delay, disconnect/reconnect behavior, and offline recovery.
- Battery life, charging, enclosure durability, and device temperature.
- Geofence boundary behavior and alerts when location accuracy is poor.
- Unauthorized device, copied ID, expired credential, and revoked tag behavior.
- Admin access isolation between groups and correctness of subscription entitlements.



### Step 8 — Finish the mobile scanning/proximity UI near the end

Per the project plan, keep the final UI polish until the device and data behavior is stable. Then refine the scanning/detection screen to show clear states such as **near**, **outside radius**, **last seen**, **signal lost**, **checkpoint scanned**, and **location uncertain**. Show approximate BLE proximity as approximate, and keep GPS distance separate from BLE signal strength so users understand what each value means.

### Step 9 — Release and operate (original Phase 2)

After the hardware and app have passed field validation:

- Prepare production configuration, secrets, database backups, and restore checks.
- Containerize backend services for repeatable development/staging/deployment. Docker is a packaging/runtime choice; it does not determine whether the database is MongoDB or PostgreSQL. For production, choose a managed database or document a tested backup, upgrade, and recovery plan if self-hosting.
- Build and publish the mobile app and admin web app, configure domains/TLS, and prepare store/release materials.
- Add logs, uptime/health checks, error reporting, device heartbeat monitoring, and alerts for backend or gateway failures.
- Generate final reports with architecture, schema, device/firmware details, tests, limitations, deployment, and monitoring evidence.



## 4. PostgreSQL and Docker status

The backend has been switched to PostgreSQL, and the MongoDB copy script is read-only against its source. It preserves the existing device IDs and connection IDs so the app can continue using its current identifiers. The script has a dry-run mode, checks for orphaned connection/location records, and uses upserts so an interrupted copy can be repeated without deleting source records.

Docker Compose now defines PostgreSQL 18.6 with a persistent named volume and the backend service. The PostgreSQL port is bound only to the local machine; the backend API remains available on port 5000 for the mobile app. Docker is packaging and orchestration here, not a database performance switch by itself.

PostgreSQL gives the planned group, membership, subscription, payment, and audit data relational constraints. It also supports spatial queries through extensions such as PostGIS if the project later needs them; the current four-member GPS proximity lookup can be calculated from the small linked group without adding that extension. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [PostGIS `ST_DWithin`](https://postgis.net/docs/manual-3.5/en/ST_DWithin.html)

**Data-copy status:** Pending. The Docker command could not connect to the Docker daemon in this environment. Start Docker Desktop/Engine, run the documented preflight, back up MongoDB, then run the explicit `--apply` copy. MongoDB is not modified and should remain available until PostgreSQL row counts and app behavior are checked.

## 5. Suggested project milestones


| Milestone                                      | Outcome                                                                        | Status                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| A. Mobile/backend prototype                    | Pairing, app location sharing, shared map, distance, buzzer, host/linked roles | Implemented in current workspace; field validation remains |
| B. Requirements and hardware selection         | Agreed use cases, range, power, network, tag/readers, and success criteria     | Planned                                                    |
| C. ESP32/BLE/RFID proof of concept             | Tags/readers produce repeatable events in a small prototype                    | Planned                                                    |
| D. Firmware and backend integration            | Secure registration, telemetry, proximity/checkpoint state, radius rules       | Planned                                                    |
| E. Admin and subscriptions                     | Tag-group monitoring, device inventory, and server-enforced paid entitlements | Prototype monitor added; IoT association and subscriptions planned |
| F. Field validation and final UI               | Measured hardware behavior, refined scanning/proximity experience              | Planned                                                    |
| G. Deployment, publishing, monitoring, reports | Production release and operational evidence                                    | Planned; original Phase 2                                  |




## 6. Project rules to follow

1. **Plan hardware behavior before buying parts.** Write required range, battery life, environment, and connectivity first.
2. **Keep each technology in its proper role.** GPS provides map coordinates; BLE estimates nearby presence; RFID records a tag at a reader/checkpoint unless a deployed reader network is designed for more; ESP32 reads/transmits events.
3. **Do not promise precise BLE meters from RSSI.** Filter readings, show uncertainty, and validate in real environments.
4. **Separate group geofencing from nearby-device search.** Define the center, radius, stale-location behavior, and enter/exit rules explicitly.
5. **Secure every hardware identity.** Use per-device credentials, TLS, revocation, and server-side authorization; never rely on a public tag ID or short pairing code as proof of identity.
6. **Protect location data.** Collect only what the feature needs, explain sharing to participants, restrict admin access, set retention/deletion rules, and log sensitive admin actions.
7. **Keep subscription enforcement on the backend.** The client can display plan state but cannot grant entitlements on its own.
8. **Version firmware, APIs, and data schemas.** Record firmware version and maintain compatibility during staged updates.
9. **Measure before release.** Define acceptance criteria and retain test evidence for range, battery, delivery delay, reconnection, geofence behavior, and access control.
10. **Finish UI polish after behavior stabilizes.** Keep the scanning/proximity screen as a late integration milestone, as requested.
11. **Keep secrets and production data out of Git.** Use environment-specific secret storage, backups, and tested restoration procedures.
12. **Treat the system as a group-awareness aid.** Do not claim it guarantees safety or replaces human supervision and a field-tested emergency plan.



## 7. Decisions to resolve before implementation

- Is the first real use outdoors, indoors, or both?
- Is checkpoint arrival sufficient, or must tags be detected continuously between checkpoints?
- Must tracking continue without mobile/cellular internet? If so, what backhaul is available?
- What radius should be enforced, and is it measured from the leader's current GPS location or a fixed group center?
- Are active RFID tags required for longer-range reads, or are passive checkpoint scans sufficient?
- Who can view precise history, how long is it retained, and how can a participant leave a group?
- Which managed PostgreSQL host and backup/restore approach should be used for production after the local Docker migration is verified?
- Which country/currency and payment methods should the subscription system support?



## References

- Espressif, “RF Coexistence — ESP32,” [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32/api-guides/coexist.html).
- Bluetooth SIG, “Distance and RSSI,” [Bluetooth Technology Website](https://www.bluetooth.com/blog/proximity-and-rssi/).
- GS1, “What is the difference between passive and active tags?,” [GS1 Support](https://support.gs1.org/support/solutions/articles/43000733398-what-is-the-difference-between-passive-and-active-tags-).
- PostgreSQL Global Development Group, “Constraints,” [PostgreSQL Documentation](https://www.postgresql.org/docs/current/ddl-constraints.html).
- PostGIS Project, “ST_DWithin,” [PostGIS Documentation](https://postgis.net/docs/manual-3.5/en/ST_DWithin.html).
- MongoDB, “Data Modeling” and “Transactions,” [MongoDB Manual](https://www.mongodb.com/docs/manual/data-modeling/) and [Transactions](https://www.mongodb.com/docs/manual/core/transactions/).
- Docker, “How Compose works” and “Use Compose in production,” [Docker Docs](https://docs.docker.com/compose/intro/compose-application-model/) and [Docker Docs](https://docs.docker.com/compose/how-tos/production/).
