// Explicitly opt out for testing; absent or misspelled settings keep verification required.
function isEmailVerificationRequired() {
  return process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() !== "false";
}

module.exports = { isEmailVerificationRequired };
