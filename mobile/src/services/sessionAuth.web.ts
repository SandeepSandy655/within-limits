import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
export function initializeSessionAuth(app: FirebaseApp) { return getAuth(app); }
