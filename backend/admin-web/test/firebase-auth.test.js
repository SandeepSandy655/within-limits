import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, setPersistence } from "firebase/auth";

test("Firebase Auth registers on the app created by firebase/app", async () => {
  const app = initializeApp({
    apiKey: "test-api-key",
    projectId: "demo-admin-auth",
  }, "admin-auth-registration-test");

  try {
    // Duplicate @firebase/app versions make getAuth throw before any sign-in.
    const auth = getAuth(app);
    await setPersistence(auth, inMemoryPersistence);
    assert.equal(auth.app, app);
    assert.equal(auth.currentUser, null);
  } finally {
    await deleteApp(app);
  }
});
