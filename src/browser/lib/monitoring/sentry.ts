import * as Sentry from "@sentry/browser";

export function initSentry(dsn: string | undefined, enabled: boolean): void {
  if (!enabled || !dsn?.trim()) return;
  Sentry.init({ dsn: dsn.trim() });
}
