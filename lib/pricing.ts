// Pure data, no server dependencies — safe to import from client components
// as well as lib/bookings.ts. Matches the prototype's four duration
// options exactly (dur.30/60/120/180).
export const DURATION_PRICING_INR: Record<number, number> = {
  30: 199,
  60: 349,
  120: 649,
  180: 899,
};

// Mid-call extension tiers (JUM calling method only) — matches the
// prototype's computeExtensionOptions() exactly.
export const EXTENSION_PRICING_INR: Record<number, number> = {
  15: 149,
  30: 249,
  45: 325,
  60: 400,
};

// Payment rows don't store the extension length directly (see
// prisma/schema.prisma's Payment model) — every tier has a distinct price,
// so the amount charged is enough to recover which one it was.
export function minutesForExtensionAmount(amountInr: number): number | null {
  const entry = Object.entries(EXTENSION_PRICING_INR).find(([, price]) => price === amountInr);
  return entry ? Number(entry[0]) : null;
}
