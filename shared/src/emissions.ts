/**
 * CO₂ estimates per trip, shown on every option card. Estimates only — the app labels them so.
 *
 * Sources (see DECISIONS.md D31):
 *  - car: 164.5 g CO₂e per vehicle-km, "Petrol car (average)", UK DESNZ/BEIS Greenhouse Gas
 *    Reporting Conversion Factors 2024. Hong Kong has no equivalent public per-km factor; most
 *    private cars here are petrol. Counted for one person (the driver).
 *  - walking: 0 (we don't count food energy, as is usual).
 * Transit and taxi factors are added with those modes.
 */
export const CO2_G_PER_KM = {
  walk: 0,
  car: 164.5,
} as const;

export function co2Grams(mode: keyof typeof CO2_G_PER_KM, distanceM: number): number {
  return Math.round((CO2_G_PER_KM[mode] * distanceM) / 1000);
}
