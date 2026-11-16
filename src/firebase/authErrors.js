// Firebase Auth error codes → the few outcomes the login screens care about.
export function authErrorCode(e) {
  const code = (e && e.code) || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email", "auth/missing-password"].includes(code)) return "bad_credentials";
  if (code === "auth/too-many-requests") return "too_many";
  if (code === "auth/network-request-failed") return "network";
  if (code === "auth/user-disabled") return "disabled";
  return "unavailable";
}
