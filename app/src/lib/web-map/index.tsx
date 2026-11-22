// Web stand-in for `react-native-maps`. On web, metro.config.js points every
// `import … from 'react-native-maps'` here, so the map screens are the same code on all platforms.
// Only the parts of the react-native-maps API that our screens use are implemented.
import { MapView } from './map-view';

export { Marker } from './marker';
export { Polyline } from './polyline';
export type { Camera, MapLatLng as LatLng } from './camera';
export type { Region } from './map-view';

/** Google map styling JSON: only used on Android, ignored on web. */
export type MapStyleElement = Record<string, unknown>;

export default MapView;
