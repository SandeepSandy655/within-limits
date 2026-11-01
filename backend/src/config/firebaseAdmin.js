const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getFirebaseAdminAuth() {
  const existing = getApps().find((app) => app.name === "within-limits-admin-auth");
  if (existing) return getAuth(existing);

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  let credential = applicationDefault();

  if (encodedServiceAccount) {
    try {
      const serviceAccount = JSON.parse(Buffer.from(encodedServiceAccount, "base64").toString("utf8"));
      credential = cert(serviceAccount);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 must contain a base64-encoded service account JSON file.");
    }
  }

  const app = initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  }, "within-limits-admin-auth");
  return getAuth(app);
}

module.exports = { getFirebaseAdminAuth };
