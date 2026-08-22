// Native: expo-sqlite's localStorage install provides a global
// localStorage implementation backed by SQLite (per Expo v57 Supabase guide).
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
