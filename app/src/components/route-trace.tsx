/**
 * Draws a recorded route inside a <MapView>: solid where GPS was good, DASHED across gaps
 * (indoors / underground, where we don't know the real path), plus checkpoint icons.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { findGaps, type CheckpointKind, type GpsSample, type LatLng } from '@scenic/shared';
import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { CHECKPOINT_INFO, describeCheckpoint } from '@/constants/checkpoints';

export const TRACE_COLOR = '#1565C0';

type Checkpoint = {
  id: number;
  kind: CheckpointKind;
  lat: number;
  lng: number;
  floorFrom: string | null;
  floorTo: string | null;
  note: string | null;
};

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Splits the track into solid pieces and the dashed jumps between them. */
export function splitAtGaps(points: readonly GpsSample[]) {
  const gaps = findGaps(points);
  const solid: GpsSample[][] = [];
  let start = 0;
  for (const gap of gaps) {
    solid.push(points.slice(start, gap.fromIndex + 1));
    start = gap.toIndex;
  }
  solid.push(points.slice(start));
  const dashed = gaps.map((g) => [points[g.fromIndex]!, points[g.toIndex]!]);
  return { solid: solid.filter((s) => s.length >= 2), dashed, gaps };
}

export function RouteTrace({
  points,
  checkpoints,
  onCheckpointPress,
}: {
  points: readonly GpsSample[];
  checkpoints: readonly Checkpoint[];
  onCheckpointPress?: (id: number) => void;
}) {
  const { solid, dashed } = splitAtGaps(points);

  return (
    <>
      {solid.map((segment, i) => (
        <Polyline
          key={`solid-${i}`}
          coordinates={segment.map(toMap)}
          strokeColor={TRACE_COLOR}
          strokeWidth={5}
        />
      ))}
      {dashed.map((segment, i) => (
        <Polyline
          key={`gap-${i}`}
          coordinates={segment.map(toMap)}
          strokeColor={TRACE_COLOR}
          strokeWidth={3}
          lineDashPattern={[8, 8]}
        />
      ))}
      {checkpoints.map((c) => (
        <Marker
          key={c.id}
          coordinate={toMap(c)}
          title={describeCheckpoint(c)}
          tracksViewChanges={false}
          onPress={() => onCheckpointPress?.(c.id)}
        >
          <View style={styles.badge}>
            <MaterialCommunityIcons name={CHECKPOINT_INFO[c.kind].icon} size={18} color="#fff" />
          </View>
        </Marker>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: TRACE_COLOR,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
