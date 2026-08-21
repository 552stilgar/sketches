export function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export class ValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "ValidationError";
  }
}
