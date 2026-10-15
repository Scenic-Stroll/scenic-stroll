/**
 * Where the sun is in the sky, computed locally with suncalc (no API, works offline).
 * Used to decide day vs night now, and later to cast building shadows for shaded routes.
 */
// @ts-types="npm:@types/suncalc@1.9.2"
import SunCalc from 'suncalc';

export type SunPosition = {
  /** Degrees above the horizon. Below 0 = the sun has set. */
  altitude_deg: number;
  /** Compass direction of the sun in degrees: 0 = north, 90 = east, 180 = south, 270 = west. */
  azimuth_deg: number;
};

const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function sunPosition(date: Date, lat: number, lng: number): SunPosition {
  const p = SunCalc.getPosition(date, lat, lng);
  return {
    altitude_deg: toDeg(p.altitude),
    // suncalc measures azimuth from SOUTH, turning west. +180° turns it into a normal compass bearing.
    azimuth_deg: (toDeg(p.azimuth) + 180 + 360) % 360,
  };
}
