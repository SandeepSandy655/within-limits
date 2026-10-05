
export const SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://10.36.180.109:5000";
