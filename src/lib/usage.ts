import "server-only";
export function lastDay() { return new Date(Date.now() - 86_400_000).toISOString(); }
