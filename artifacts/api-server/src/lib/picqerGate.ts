/** Explicit production opt-in; all test/development environments are blocked. */
export function picqerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.LIVE_INTEGRATIONS === "1" && env.PICQER_ENABLED === "1";
}