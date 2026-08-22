// Base module used for TypeScript resolution and platforms without
// a dedicated variant (metro prefers auth-storage.native.ts / .web.ts).
export const authStorage = globalThis.localStorage;
