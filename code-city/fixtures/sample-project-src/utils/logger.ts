export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  log(level: LogLevel, message: string): void {
    const line = `[${level.toUpperCase()}] ${this.prefix}: ${message}`;
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}
