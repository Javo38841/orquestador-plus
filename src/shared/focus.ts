/** Focus timer duration limits and default, in minutes (RF-17). */
export const FOCUS_MIN_MINUTES = 1;
export const FOCUS_MAX_MINUTES = 180;
export const FOCUS_DEFAULT_MINUTES = 25;

export function isFocusMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= FOCUS_MIN_MINUTES &&
    value <= FOCUS_MAX_MINUTES
  );
}
