const { getFirebaseAdminAuth } = require("../config/firebaseAdmin");

async function requireAdmin(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!match) {
    return res.status(401).json({ success: false, message: "Sign in with an admin account to continue." });
  }

  try {
    const claims = await getFirebaseAdminAuth().verifyIdToken(match[1], true);
    const role = claims.adminRole;
    if (!["group_admin", "super_admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "This account does not have admin access." });
    }

    req.adminUser = { uid: claims.uid, role };
    return next();
  } catch (error) {
    const isTokenError = typeof error.code === "string" && error.code.startsWith("auth/");
    if (!isTokenError) {
      console.error(`[auth:admin] Firebase token verification unavailable: ${error.message}`);
    }
    return res.status(isTokenError ? 401 : 503).json({
      success: false,
      message: isTokenError
        ? "Your sign-in has expired or is invalid. Please sign in again."
        : "Admin authentication is unavailable. Check Firebase Admin credentials on the backend.",
    });
  }
}

module.exports = requireAdmin;
