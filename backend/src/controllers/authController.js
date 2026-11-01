function getFirebaseClientConfig(_req, res) {
  const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_WEB_APP_ID,
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    return res.status(503).json({
      success: false,
      message: "Firebase Authentication is not configured on the backend.",
      missing,
    });
  }
  return res.json({ success: true, firebase: config });
}

module.exports = { getFirebaseClientConfig };
