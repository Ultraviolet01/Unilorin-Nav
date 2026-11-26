export const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported (e.g. iOS) */ } };
