// Data sources and credits (the /attribution page). Licences require these notices; keep them
// complete when you add a data source. DECISIONS D47.
import { Platform } from 'react-native';

import type { IconName } from '@/components/ui/icon';

export type Credit = { icon: IconName; title: string; credit: string };

export const CREDITS: Credit[] = [
  Platform.OS === 'web'
    ? {
        icon: 'map',
        title: 'Map',
        credit:
          'Map tiles by OpenFreeMap · © OpenMapTiles · data © OpenStreetMap contributors (ODbL)',
      }
    : { icon: 'map', title: 'Map', credit: 'Google Maps (Android) · Apple Maps (iPhone)' },
  { icon: 'map-outline', title: 'Landmark data', credit: '© OpenStreetMap contributors (ODbL)' },
  {
    icon: 'weather-partly-cloudy',
    title: 'Weather data',
    credit: '© Hong Kong Observatory, HKSAR Government · via DATA.GOV.HK',
  },
  {
    icon: 'walk',
    title: 'Walking network',
    credit: '3D Pedestrian Network © Lands Department, HKSAR Government · via CSDI / DATA.GOV.HK',
  },
  {
    icon: 'weather-sunny-off',
    title: 'Shade estimates',
    credit:
      'Building heights © Lands Department, HKSAR Government · trees © OpenStreetMap contributors (ODbL)',
  },
  {
    icon: 'car',
    title: 'Driving routes',
    credit:
      'Google Maps Platform (live traffic, when enabled) · openrouteservice.org, © OpenStreetMap contributors',
  },
  {
    icon: 'train',
    title: 'Public transport',
    credit:
      'MTR lines, stations and fares © MTR Corporation · via DATA.GOV.HK · station positions © OpenStreetMap contributors (ODbL) · Google Maps Platform (when enabled)',
  },
  {
    icon: 'taxi',
    title: 'Taxi fares',
    credit: 'Urban taxi meter tariff (from 14 July 2024) · Transport Department, HKSAR Government',
  },
  {
    icon: 'alert-outline',
    title: 'Traffic and incidents',
    credit:
      'Road traffic layer by Google Maps / Apple Maps · incidents from Transport Department special traffic news · via DATA.GOV.HK',
  },
  {
    icon: 'clock-fast',
    title: 'Live arrivals',
    credit:
      'MTR Next Train, KMB/LWB, Citybus and green minibus (Transport Department) real-time data · via DATA.GOV.HK',
  },
  {
    icon: 'magnify',
    title: 'Place search',
    credit: 'openrouteservice.org (Pelias), © OpenStreetMap contributors',
  },
];
