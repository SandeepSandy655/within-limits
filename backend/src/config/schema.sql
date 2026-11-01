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
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
CREATE INDEX IF NOT EXISTS devices_created_at_idx ON devices(created_at DESC);
CREATE INDEX IF NOT EXISTS connections_requester_status_created_idx
  ON connections(requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS connections_receiver_status_created_idx
  ON connections(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS locations_device_timestamp_idx
  ON locations(device_id, timestamp DESC);
