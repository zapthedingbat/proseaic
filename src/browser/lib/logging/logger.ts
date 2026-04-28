
/* eslint-disable @typescript-eslint/no-explicit-any */
// Logger methods intentionally accept any arguments, matching the Console API signature.
export interface Logger {
  trace(...data: any[]): void;
  info(...data: any[]): void;
  debug(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
