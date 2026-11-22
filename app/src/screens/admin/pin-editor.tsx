// /admin/new — an expert creates a pin: place it on the map, snap it to a pedestrian-network node
// or an OSM place within 25 m (or describe a custom place), then title, summary, radius, topics and
// SDG tags. Sources, the "beyond Hong Kong" line and the AI reading versions come next, on the
// pin's page. D53.
import {
  PIN_RADIUS,
  SNAP_RADIUS_M,
  type LatLng,
  type PlaceRef,
  type SnapResponse,
} from '@scenic/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Chip } from '@/components/ui/chip';
import { snapPin } from '@/lib/api';
import { createPin } from '@/lib/pins-admin';
import { useAuth } from '@/providers/auth-provider';
import { radius, space, type, useAppTheme } from '@/theme';

import { Button, ErrorText, Field, Row, Section } from './parts';

const START = {
  center: { latitude: 22.3372, longitude: 114.1745 },
  zoom: 16,
  pitch: 0,
  heading: 0,
};
const SDGS = Array.from({ length: 17 }, (_, i) => i + 1);

type PlaceChoice = 'ped_node' | 'osm' | 'custom';

export function PinEditor() {
  const t = useAppTheme();
  const auth = useAuth();
  const [point, setPoint] = useState<LatLng | null>(null);
  const [snap, setSnap] = useState<SnapResponse | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [choice, setChoice] = useState<PlaceChoice>('custom');
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [radiusM, setRadiusM] = useState<number>(PIN_RADIUS.default);
  const [topics, setTopics] = useState('');
  const [sdgs, setSdgs] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (p: LatLng) => {
    setPoint(p);
    setSnap(null);
    setSnapping(true);
    try {
      const found = await snapPin(p);
      setSnap(found);
      setChoice(found.ped_node ? 'ped_node' : found.osm ? 'osm' : 'custom');
    } catch {
      setChoice('custom'); // snapping is a convenience; the expert can always describe the place
    } finally {
      setSnapping(false);
    }
  };

  /** The pin's point and what it's attached to, from the expert's choice. */
  const place = (): { point: LatLng; ref: PlaceRef } | null => {
    if (!point) return null;
    if (choice === 'ped_node' && snap?.ped_node) {
      const n = snap.ped_node;
      return {
        point: { lat: n.lat, lng: n.lng },
        ref: { kind: 'ped_node', build_id: n.build_id, node_id: n.node_id },
      };
    }
    if (choice === 'osm' && snap?.osm) {
      return {
        point: { lat: snap.osm.lat, lng: snap.osm.lng },
        ref: { kind: 'osm', osm_id: snap.osm.osm_id },
      };
    }
    if (description.trim().length < 5) return null;
    return { point, ref: { kind: 'custom', description: description.trim() } };
  };

  const chosen = place();
  const ready = chosen !== null && title.trim().length >= 3 && summary.trim().length >= 20;

  const save = async () => {
    if (!chosen || auth.status !== 'signed-in') return;
    setSaving(true);
    setError(null);
    try {
      const id = await createPin(auth.session.user.id, {
        title: title.trim(),
        summary: summary.trim(),
        point: chosen.point,
        place: chosen.ref,
        radius_m: radiusM,
        topics: topics
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        sdg_tags: sdgs,
      });
      router.replace({ pathname: '/admin/pin/[id]', params: { id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Section title="1. Place">
        <Text style={[type.small, { color: t.textSecondary }]}>
          Click the map where the pin belongs. It snaps to a walkway point or a mapped place within{' '}
          {SNAP_RADIUS_M} m — or choose “custom place” for things that aren’t on any map (a tree, a
          boundary stone).
        </Text>
        <View style={[styles.map, { borderColor: t.border }]}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialCamera={START}
            onPress={(e) =>
              void pick({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
          >
            {(chosen ?? point) ? (
              <Marker
                coordinate={{
                  latitude: (chosen?.point ?? point)!.lat,
                  longitude: (chosen?.point ?? point)!.lng,
                }}
                title="New pin"
              />
            ) : null}
          </MapView>
        </View>
        {snapping ? <Text>Looking for places nearby…</Text> : null}
        {point && !snapping ? (
          <Row>
            {snap?.ped_node ? (
              <Chip
                label={`Walkway: ${snap.ped_node.kind.replace('_', ' ')} (${snap.ped_node.distance_m} m)`}
                selected={choice === 'ped_node'}
                onPress={() => setChoice('ped_node')}
              />
            ) : null}
            {snap?.osm ? (
              <Chip
                label={`OSM: ${snap.osm.name} (${snap.osm.distance_m} m)`}
                selected={choice === 'osm'}
                onPress={() => setChoice('osm')}
              />
            ) : null}
            <Chip
              label="Custom place"
              selected={choice === 'custom'}
              onPress={() => setChoice('custom')}
            />
          </Row>
        ) : null}
        {point && choice === 'custom' ? (
          <Field
            label="Describe the place"
            hint="So a walker can find it: what it is and where exactly (5–200 characters)."
            value={description}
            onChangeText={setDescription}
            placeholder="Granite boundary stone at the foot of the steps, east side of Kent Road"
            maxLength={200}
          />
        ) : null}
      </Section>

      <Section title="2. What the pin says">
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <Field
          label="Summary"
          hint="In your own words, only facts from your sources (20–2,000 characters). The reading versions are written from this."
          value={summary}
          onChangeText={setSummary}
          multiline
          maxLength={2000}
        />
        <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>Collect radius</Text>
        <Row>
          {[30, 40, 50].map((r) => (
            <Chip key={r} label={`${r} m`} selected={radiusM === r} onPress={() => setRadiusM(r)} />
          ))}
        </Row>
        <Field
          label="Topics"
          hint="Separated by commas, e.g. history, street names"
          value={topics}
          onChangeText={setTopics}
        />
        <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>
          UN Sustainable Development Goals (optional)
        </Text>
        <Row>
          {SDGS.map((n) => (
            <Chip
              key={n}
              small
              label={`SDG ${n}`}
              selected={sdgs.includes(n)}
              onPress={() => setSdgs(sdgs.includes(n) ? sdgs.filter((x) => x !== n) : [...sdgs, n])}
            />
          ))}
        </Row>
      </Section>

      <ErrorText text={error} />
      <Button
        label="Save draft and add sources"
        tone="primary"
        disabled={!ready || saving}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg, maxWidth: 960, width: '100%', alignSelf: 'center' },
  map: { height: 360, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  bold: { fontWeight: '600' },
});
