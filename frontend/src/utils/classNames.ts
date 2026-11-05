/**
 * Tiny class-name combiner. Accepts strings, falsy values and
 * `{ className: condition }` maps, returning a space-joined string.
 */
type ClassValue = string | false | null | undefined | Record<string, boolean>;

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string') {
      out.push(value);
    } else {
      for (const [key, active] of Object.entries(value)) {
        if (active) out.push(key);
      }
    }
  }
  return out.join(' ');
}
