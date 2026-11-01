require("dotenv").config();

const { getFirebaseAdminAuth } = require("../config/firebaseAdmin");

async function main() {
  const email = process.env.ADMIN_USER_EMAIL?.trim();
  const role = process.env.ADMIN_USER_ROLE?.trim();
  if (!email || !["group_admin", "super_admin", "none"].includes(role)) {
    throw new Error("Set ADMIN_USER_EMAIL and ADMIN_USER_ROLE to group_admin, super_admin, or none.");
  }

  const auth = getFirebaseAdminAuth();
  const user = await auth.getUserByEmail(email);
  const customClaims = { ...(user.customClaims || {}) };
  if (role === "none") delete customClaims.adminRole;
  else customClaims.adminRole = role;

  await auth.setCustomUserClaims(user.uid, customClaims);
  console.log(`[auth] Updated admin role for ${email}: ${role}`);
  console.log("The account must sign in again or refresh its token to receive the updated role.");
}

main().catch((error) => {
  console.error(`[auth] Could not update admin role: ${error.message}`);
  process.exitCode = 1;
});
