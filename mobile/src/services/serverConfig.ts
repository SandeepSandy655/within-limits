
export const SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://10.178.92.109:5000";
