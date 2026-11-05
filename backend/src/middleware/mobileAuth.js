const { getFirebaseAdminAuth } = require("../config/firebaseAdmin");
const { pool } = require("../config/database");
const { isEmailVerificationRequired } = require("../config/authPolicy");

async function verifyMobileToken(token) {
  if (typeof token !== "string" || !token) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  let claims;
  try { claims = await getFirebaseAdminAuth().verifyIdToken(token, true); }
  catch (error) {
    const tokenError = error.code?.startsWith("auth/");
    throw Object.assign(new Error(tokenError ? "Your session expired. Please sign in again." : "Sign-in is temporarily unavailable."), { status: tokenError ? 401 : 503 });
  }
  if (!claims.email) throw Object.assign(new Error("Sign in with an email account to continue."), { status: 403 });
  if (isEmailVerificationRequired() && claims.email_verified !== true) throw Object.assign(new Error("Verify your email before registering a device or joining a group."), { status: 403 });
  return { uid: claims.uid, email: claims.email, expiresAt: claims.exp * 1000 };
}

async function requireMobileUser(req, res, next) {
  try {
    req.mobileUser = await verifyMobileToken(/^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1]);
    next();
  } catch (error) { res.status(error.status || 503).json({ success: false, message: error.message }); }
}

async function ownsDevice(uid, deviceId) {
  if (typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 128) return false;
  const result = await pool.query("SELECT 1 FROM devices WHERE device_id = $1 AND owner_id = $2", [deviceId, uid]);
  return result.rowCount > 0;
}

function requireOwnDevice(source = "body", field = "deviceId") {
  return async (req, res, next) => {
    try {
      if (!await ownsDevice(req.mobileUser.uid, req[source]?.[field])) return res.status(403).json({ success: false, message: "This device does not belong to your account. Register this installation first." });
      next();
    } catch (error) { next(error); }
  };
}

const attempts = new Map();
function limitPairing(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.mobileUser.uid;
  const entry = attempts.get(key) || { count: 0, until: now + 60_000 };
  if (entry.count >= 20 || (!attempts.has(key) && attempts.size >= 10_000)) {
    res.set("Retry-After", "60");
    return res.status(429).json({ success: false, message: "Too many pairing attempts. Try again in a minute." });
  }
  entry.count += 1; attempts.set(key, entry); next();
}

module.exports = { verifyMobileToken, requireMobileUser, requireOwnDevice, ownsDevice, limitPairing };
