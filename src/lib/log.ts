type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) || "info";

function emit(level: Level, scope: string, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < order[minLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Structured JSON logger, scoped per module. */
export function logger(scope: string) {
  return {
    debug: (msg: string, f?: Record<string, unknown>) => emit("debug", scope, msg, f),
    info: (msg: string, f?: Record<string, unknown>) => emit("info", scope, msg, f),
    warn: (msg: string, f?: Record<string, unknown>) => emit("warn", scope, msg, f),
    error: (msg: string, f?: Record<string, unknown>) => emit("error", scope, msg, f),
  };
}
