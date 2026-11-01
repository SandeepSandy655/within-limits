# Backend, PostgreSQL migration, and admin monitor

The live backend now uses PostgreSQL through `pg`. MongoDB is retained only as the read-only source for the copy migration; the migration does not drop or modify the MongoDB database.

## Run with Docker Compose

1. Copy the project-root `.env.example` to `.env` and set a strong `POSTGRES_PASSWORD` plus the Firebase Web app config values. The Firebase Web API key is public client configuration; the service-account value is a private backend credential:

   ```sh
   openssl rand -hex 32
   ```

   For Docker, encode the Firebase service-account JSON as one line and put it in `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` in the private root `.env`:

   ```sh
   base64 -w0 /path/to/firebase-service-account.json
   ```

2. Make sure `backend/.env` contains the existing `MONGODB_URI` for the source data. Keep that file private and untracked.
3. Start only PostgreSQL first:

   ```sh
   docker compose up -d postgres
   ```

4. Run the migration preflight (read-only for MongoDB; creates the empty PostgreSQL schema):

   ```sh
   docker compose --profile migration run --rm mongo-copy
   ```

5. Back up the MongoDB database. After reviewing the preflight counts and reference check, copy records with:

   ```sh
   docker compose --profile migration run --rm mongo-copy npm run migrate:mongo -- --apply
   ```

   The script copies devices, connections, current locations, and location history using upserts. It does not delete MongoDB data. If a copy is interrupted, rerunning it is safe for records with the same IDs.

6. Start the backend:

   ```sh
   docker compose up -d --build backend
   ```

   Visit `http://localhost:5000/health` and `http://localhost:5000/admin`. On another device, use the computer's reachable LAN IP instead of `localhost`. Set the mobile app's `EXPO_PUBLIC_API_URL` to `http://<LAN-IP>:5000` and restart Expo.

PostgreSQL data is stored in the named `postgres_data` volume. Do not run `docker compose down -v` unless you intend to delete that database volume. MongoDB remains unchanged as a rollback/source copy; do not switch production traffic until the import counts and app behavior have been checked.

## Run backend outside Docker

Set `DATABASE_URL`, the Firebase Web app config, and Firebase Admin credentials in the private `backend/.env`, and run:

```sh
npm install
npm run dev
```

For a local PostgreSQL service, use `postgresql://within_limits_app:<password>@localhost:5432/within_limits`.

## Admin monitor

The dashboard at `/admin` is a React app built with Vite. Its source is in `admin-web/`; production assets are built into `public/admin/` and served by Express. Admin sign-in uses Firebase Authentication email/password accounts. The backend verifies Firebase ID tokens and requires an `adminRole` claim of `group_admin` or `super_admin`; PostgreSQL remains the application database. The admin overview excludes mobile GPS coordinates, and it does not show a user directory.

For local React development, start the backend and, in another terminal from `backend/`, run:

```sh
npm run admin:dev
```

Open the Vite URL it prints (usually `http://localhost:5173`). API requests are proxied to the backend on port 5000. To rebuild the static assets served at `/admin`, run:

```sh
npm run admin:build
```

Docker builds the React assets as part of its multi-stage image build. Rebuild the backend after admin source changes with `docker compose up -d --build backend`.

To configure sign-in, add a Firebase Web app and enable the Email/Password provider in Firebase Authentication. Put the Web API key, Auth domain, project ID, and Web app ID into the Firebase variables in `.env`. Configure backend Admin SDK credentials using `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` for Docker or Application Default Credentials for local development. Add the deployed admin host and `localhost` to Firebase Authentication's authorized domains when needed.

Create admin accounts in Firebase Authentication; the admin page intentionally has no public sign-up. Assign a role from `backend/` after configuring Firebase Admin credentials:

```sh
ADMIN_USER_EMAIL=admin@example.com ADMIN_USER_ROLE=super_admin npm run admin:set-role
```

Use `group_admin` for an operator account and `none` to remove admin access. The role script sets a Firebase custom claim; the account must sign in again after a role change. Only trusted project owners should grant roles. Before public production access, use HTTPS and review audit logging and authorization for all mobile endpoints.

## IoT integration status

ESP32/BLE/RFID firmware and authenticated telemetry ingestion are not implemented yet. The dashboard can currently show accepted group connections and their connection status, but checkpoint locations and tag events will remain unavailable until the hardware API is implemented. Mobile GPS is intentionally excluded from the admin overview. App registration represents a device installation, not a user account; the admin console does not display a registered-user directory. Do not use `/api/devices/register` as production hardware authentication; it accepts a client-supplied device ID and does not provision a per-device secret.

Before configuring real devices, define a hardware enrollment/provisioning flow, per-device credential and revocation, group/tag assignment, firmware network and TLS settings, BLE or RFID reader behavior, and the telemetry API/broker contract. The app should receive those observations from the backend; it should not contain hardware credentials or database secrets.
