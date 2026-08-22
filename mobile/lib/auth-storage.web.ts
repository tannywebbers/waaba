// Web: browsers already provide a native localStorage implementation,
// so we avoid pulling in expo-sqlite's WASM stack entirely.
export const authStorage = globalThis.localStorage;
