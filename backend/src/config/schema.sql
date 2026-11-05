CREATE TABLE IF NOT EXISTS devices (
  id TEXT NOT NULL UNIQUE,
  device_id TEXT PRIMARY KEY,
  connection_code VARCHAR(8) UNIQUE,
  owner_id TEXT,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  device_type TEXT NOT NULL DEFAULT 'mobile',
  platform TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  location JSONB,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT devices_connection_code_format CHECK (
    connection_code IS NULL OR connection_code ~ '^[0-9]{8}$'
  )
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  location JSONB NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devices_owner_id_idx ON devices(owner_id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
CREATE INDEX IF NOT EXISTS devices_created_at_idx ON devices(created_at DESC);
CREATE INDEX IF NOT EXISTS connections_requester_status_created_idx
  ON connections(requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS connections_receiver_status_created_idx
  ON connections(receiver_id, status, created_at DESC);
-- Existing mobile connections start with a 1 km range; hosts select a range for new approvals.
ALTER TABLE connections ADD COLUMN IF NOT EXISTS range_meters INTEGER NOT NULL DEFAULT 1000
  CHECK (range_meters IN (1000, 2000));
ALTER TABLE connections ADD COLUMN IF NOT EXISTS out_of_range_since TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS mobile_notifications (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_device_id TEXT REFERENCES devices(device_id) ON DELETE SET NULL,
  connection_id TEXT,
  event_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mobile_notifications_device_created_idx
  ON mobile_notifications(device_id, created_at DESC);
CREATE TABLE IF NOT EXISTS mobile_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  host_device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  sender_device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  client_message_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (sender_device_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS mobile_chat_host_id_idx ON mobile_chat_messages(host_device_id, id DESC);
CREATE INDEX IF NOT EXISTS mobile_chat_sender_created_idx ON mobile_chat_messages(sender_device_id, created_at DESC);
CREATE TABLE IF NOT EXISTS mobile_chat_reads (
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  host_device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  last_message_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, host_device_id)
);
CREATE INDEX IF NOT EXISTS locations_device_timestamp_idx
  ON locations(device_id, timestamp DESC);

-- These identities are separate from mobile app connections.
CREATE TABLE IF NOT EXISTS monitoring_routes (
  id UUID PRIMARY KEY, owner_uid TEXT NOT NULL, name TEXT NOT NULL, region TEXT NOT NULL,
  path JSONB NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY, route_id UUID NOT NULL REFERENCES monitoring_routes(id),
  name TEXT NOT NULL, position INTEGER NOT NULL CHECK (position >= 0),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  UNIQUE (id, route_id)
);
CREATE TABLE IF NOT EXISTS tracked_groups (
  id UUID PRIMARY KEY, route_id UUID NOT NULL REFERENCES monitoring_routes(id),
  name TEXT NOT NULL, leader_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, route_id)
);
CREATE TABLE IF NOT EXISTS tracking_members (
  id UUID PRIMARY KEY, group_id UUID NOT NULL REFERENCES tracked_groups(id),
  name TEXT NOT NULL, tag_id TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, group_id)
);
CREATE TABLE IF NOT EXISTS checkpoint_reporters (
  id TEXT PRIMARY KEY, checkpoint_id UUID NOT NULL REFERENCES checkpoints(id),
  token_hash TEXT NOT NULL UNIQUE, revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS checkpoint_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES checkpoint_reporters(id), event_id TEXT NOT NULL,
  route_id UUID NOT NULL, checkpoint_id UUID NOT NULL, group_id UUID NOT NULL, member_id UUID NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (checkpoint_id, route_id) REFERENCES checkpoints(id, route_id),
  FOREIGN KEY (group_id, route_id) REFERENCES tracked_groups(id, route_id),
  FOREIGN KEY (member_id, group_id) REFERENCES tracking_members(id, group_id),
  UNIQUE (reporter_id, event_id)
);
CREATE INDEX IF NOT EXISTS monitoring_routes_owner_idx ON monitoring_routes(owner_uid);
CREATE INDEX IF NOT EXISTS checkpoints_route_idx ON checkpoints(route_id, position);
CREATE INDEX IF NOT EXISTS tracking_members_group_idx ON tracking_members(group_id);
CREATE INDEX IF NOT EXISTS checkpoint_reports_member_idx ON checkpoint_reports(member_id, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS checkpoint_reports_group_idx ON checkpoint_reports(group_id, checkpoint_id);

-- A member row represents one trip assignment; completed rows retain their history.
ALTER TABLE monitoring_routes ADD COLUMN IF NOT EXISTS auto_enroll BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE monitoring_routes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE monitoring_routes ADD COLUMN IF NOT EXISTS data_cleared_at TIMESTAMPTZ;
ALTER TABLE monitoring_routes ADD COLUMN IF NOT EXISTS map_mode TEXT NOT NULL DEFAULT 'geographic' CHECK (map_mode IN ('geographic','schematic'));
ALTER TABLE monitoring_routes ADD COLUMN IF NOT EXISTS next_person_number INTEGER NOT NULL DEFAULT 1 CHECK (next_person_number > 0);
ALTER TABLE tracked_groups ADD COLUMN IF NOT EXISTS auto_enroll BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tracked_groups ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tracked_groups ADD COLUMN IF NOT EXISTS route_snapshot JSONB;
DROP INDEX IF EXISTS tracked_groups_auto_enroll_route_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tracked_groups_open_auto_enroll_route_idx ON tracked_groups(route_id) WHERE auto_enroll AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS tracked_groups_history_idx ON tracked_groups(completed_at DESC,id DESC) WHERE completed_at IS NOT NULL;
ALTER TABLE tracking_members ADD COLUMN IF NOT EXISTS trip_started_at TIMESTAMPTZ;
ALTER TABLE tracking_members ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;
-- Preserve the old uniqueness guarantee for active assignments while allowing reuse after exit.
CREATE UNIQUE INDEX IF NOT EXISTS tracking_members_active_tag_idx ON tracking_members(tag_id) WHERE active;
ALTER TABLE tracking_members DROP CONSTRAINT IF EXISTS tracking_members_tag_id_key;
CREATE INDEX IF NOT EXISTS tracking_members_tag_history_idx ON tracking_members(tag_id, exited_at DESC);

-- Preserve previously completed groups when upgrading an existing database.
WITH closed AS (SELECT group_id,MAX(exited_at) AS completed_at FROM tracking_members GROUP BY group_id HAVING BOOL_AND(NOT active AND exited_at IS NOT NULL))
UPDATE tracked_groups g SET completed_at=s.completed_at,route_snapshot=jsonb_build_object(
  'id',r.id,'name',r.name,'region',r.region,'path',r.path,'mapMode',r.map_mode,
  'checkpoints',(SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'latitude',c.latitude,'longitude',c.longitude) ORDER BY c.position,c.id) FROM checkpoints c WHERE c.route_id=r.id))
FROM monitoring_routes r,closed s
WHERE g.route_id=r.id AND s.group_id=g.id AND g.completed_at IS NULL AND s.completed_at IS NOT NULL;

-- BLE proximity is a separate observation stream; it never creates RFID visits.
CREATE TABLE IF NOT EXISTS proximity_monitors (
  id TEXT PRIMARY KEY, route_id UUID NOT NULL REFERENCES monitoring_routes(id),
  name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, tag_id TEXT,
  revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proximity_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES proximity_monitors(id), event_id TEXT NOT NULL,
  tag_id TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('waiting','near','far','lost')),
  rssi INTEGER CHECK (rssi BETWEEN -127 AND 20), buzzer_enabled BOOLEAN NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (monitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS proximity_monitors_route_idx ON proximity_monitors(route_id);
CREATE INDEX IF NOT EXISTS proximity_reports_latest_idx ON proximity_reports(monitor_id, observed_at DESC, id DESC);
ALTER TABLE proximity_monitors ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES tracking_members(id);
ALTER TABLE proximity_monitors ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE proximity_monitors ADD COLUMN IF NOT EXISTS out_of_range_since TIMESTAMPTZ;
ALTER TABLE proximity_monitors ADD COLUMN IF NOT EXISTS reports_cleared_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS proximity_monitors_member_idx ON proximity_monitors(member_id) WHERE member_id IS NOT NULL;
