/**
 * CO₂ estimates per trip, shown on every option card. Estimates only — the app labels them so.
 *
 * Sources (see DECISIONS.md D31):
 *  - car: 164.5 g CO₂e per vehicle-km, "Petrol car (average)", UK DESNZ/BEIS Greenhouse Gas
 *    Reporting Conversion Factors 2024. Hong Kong has no equivalent public per-km factor; most
 *    private cars here are petrol. Counted for one person (the driver).
 *  - walking: 0 (we don't count food energy, as is usual).
 *  - rail (MTR, light rail, tram): 55 g CO₂e per passenger-km — the low end of the 55–71 g range
 *    published for MTR's urban rail in 2008–2017 (Aston University study using MTR data); MTR
 *    has cut its rail emissions per passenger-km since, so this is if anything high.
 *  - bus / minibus / ferry: 130 g per passenger-km, "Local bus (not London)", DESNZ 2024. Hong
 *    Kong buses carry more people than the UK average, so this overstates them — it works
 *    against our own green nudge, never for it.
 * Taxi factors are added with that mode.
 */
export const CO2_G_PER_KM = {
  walk: 0,
  car: 164.5,
  rail: 55,
  bus: 130,
} as const;

export function co2Grams(mode: keyof typeof CO2_G_PER_KM, distanceM: number): number {
  return Math.round((CO2_G_PER_KM[mode] * distanceM) / 1000);
}
