// Pure data, no server dependencies — safe to import from client components
// as well as lib/bookings.ts. Matches the prototype's four duration
// options exactly (dur.30/60/120/180).
export const DURATION_PRICING_INR: Record<number, number> = {
  30: 199,
  60: 349,
  120: 649,
  180: 899,
};
