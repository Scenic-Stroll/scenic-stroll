/**
 * Review a recording before it's shared: title, start/end labels (snapped to the nearest landmark),
 * description in any language, "show my name", privacy trim, and fixing GPS gaps with checkpoints.
 * Save puts it in the upload queue. Also used to edit or delete routes from My routes.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  buildRouteUpload,
  filterSamples,
  findGaps,
  formatDistance,
  formatDuration,
  nearestPreset,
  uploadLengthMeters,
  type CheckpointKind,
  type GpsSample,
  type LatLng,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import MapView from 'react-native-maps';

import { CheckpointSheet, type CheckpointDetails } from '@/components/checkpoint-sheet';
import { RouteTrace } from '@/components/route-trace';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHECKPOINT_INFO, describeCheckpoint } from '@/constants/checkpoints';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as localDb from '@/lib/local-db';
import { localKeys, refreshLocalData } from '@/lib/query-client';
import { startRecording } from '@/lib/recorder';
import { useSettings } from '@/lib/settings-store';
import { supabase } from '@/lib/supabase';
import { processUploadQueue } from '@/lib/upload-queue';

const BLUE = '#1565C0';
/** Start/end labels snap to a landmark this close (build prompt: 60 m). */
const SNAP_METERS = 60;
const GAP_CHECKPOINT_KINDS: CheckpointKind[] = [
  'lift',
  'escalator',
  'stairs',
  'entrance',
  'underpass',
  'note',
];

export function ReviewScreen({ id }: { id: string }) {
  const recording = useQuery({
    queryKey: localKeys.recording(id),
    queryFn: () => localDb.loadRecording(id),
  });

  if (recording.isPending) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (!recording.data) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>This recording no longer exists.</ThemedText>
      </ThemedView>
    );
  }
  return <ReviewForm rec={recording.data} />;
}

function ReviewForm({ rec }: { rec: localDb.RecordingDetail }) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const dataCollection = useSettings((s) => s.dataCollectionMode);
  const takeRouteNumber = useSettings((s) => s.takeRouteNumber);
  const uploaded = rec.status === 'uploaded';

  const points = useMemo(() => filterSamples(rec.samples), [rec.samples]);
  const first = points[0];
  const last = points.at(-1);

  // Form fields start from what was saved, or from the nearest landmark.
  const [startLabel, setStartLabel] = useState(
    rec.startLabel ?? (first ? (nearestPreset(first, SNAP_METERS)?.en ?? '') : ''),
  );
  const [endLabel, setEndLabel] = useState(
    rec.endLabel ?? (last ? (nearestPreset(last, SNAP_METERS)?.en ?? '') : ''),
  );
  const [title, setTitle] = useState(rec.title);
  const [description, setDescription] = useState(rec.description ?? '');
  const showNameByDefault = useSettings((s) => s.showNameByDefault);
  // New recordings start from the Profile → Privacy default; saved ones keep their own choice.
  const [showAuthor, setShowAuthor] = useState(
    rec.status === 'draft' ? showNameByDefault : rec.showAuthor,
  );
  const [trimEnds, setTrimEnds] = useState(rec.trimEnds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gapTarget, setGapTarget] = useState<GpsSample | null>(null);
  const [sheetKind, setSheetKind] = useState<CheckpointKind | null>(null);

  // A sensible default title so saving is one tap.
  const suggestedTitle =
    startLabel.trim() && endLabel.trim()
      ? `${startLabel.trim()} → ${endLabel.trim()}`.slice(0, 80)
      : '';
  const titlePlaceholder = dataCollection
    ? 'Route N (numbered automatically)'
    : suggestedTitle || 'e.g. Exit C1 → YEUNG';

  // Exactly what would be uploaded, recomputed as the form changes — shows problems before Save.
  const preview = useMemo(
    () =>
      buildRouteUpload({
        ...rec,
        title: title.trim() || suggestedTitle || 'Route',
        startLabel,
        endLabel,
        description,
        showAuthor,
        trimEnds,
      }),
    [rec, title, suggestedTitle, startLabel, endLabel, description, showAuthor, trimEnds],
  );

  const gaps = useMemo(() => findGaps(points), [points]);
  const gapHasCheckpoint = (fromTs: number, toTs: number) =>
    rec.checkpoints.some((c) => c.timestamp >= fromTs && c.timestamp <= toTs);

  const save = async (andRecordAnother: boolean) => {
    setError(null);
    let finalTitle = title.trim() || suggestedTitle;
    if (!finalTitle && dataCollection) finalTitle = `Route ${takeRouteNumber()}`;
    if (!finalTitle) {
      setError('Give the route a title.');
      return;
    }
    if (!uploaded && !preview.ok) {
      setError(preview.error);
      return;
    }
    const fields: localDb.ReviewFields = {
      title: finalTitle,
      startLabel: startLabel.trim() || null,
      endLabel: endLabel.trim() || null,
      description: description.trim() || null,
      showAuthor,
      trimEnds,
    };

    setBusy(true);
    try {
      if (uploaded) {
        // Already on the server: update the fields the server lets owners change.
        const { error: updateError } = await supabase
          .from('routes')
          .update({
            title: fields.title,
            start_label: fields.startLabel,
            end_label: fields.endLabel,
            show_author: fields.showAuthor,
          })
          .eq('id', rec.id);
        if (updateError) {
          setError(`Couldn’t update the server copy: ${updateError.message}`);
          return;
        }
      }
      await localDb.saveReview(rec.id, fields);
      await refreshLocalData();
      void processUploadQueue(); // uploads now if online; otherwise it stays queued
      router.back();
      if (andRecordAnother) {
        await startRecording({ trimEnds: false });
        router.navigate('/record');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Delete this route?',
      uploaded
        ? 'It will be removed from the server and from your phone.'
        : 'It will be removed from your phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (uploaded) {
              const { error: deleteError } = await supabase
                .from('routes')
                .delete()
                .eq('id', rec.id);
              if (deleteError) {
                setError(
                  `Couldn’t delete from the server (are you online?): ${deleteError.message}`,
                );
                return;
              }
            }
            await localDb.deleteRecording(rec.id);
            await refreshLocalData();
            router.back();
          },
        },
      ],
    );
  };

  const addGapCheckpoint = async (kind: CheckpointKind, details: CheckpointDetails) => {
    if (!gapTarget) return;
    await localDb.addCheckpoint(rec.id, {
      kind,
      lat: gapTarget.lat,
      lng: gapTarget.lng,
      ...details,
      // Just after the last fix before the gap, so it sorts into the gap.
      timestamp: gapTarget.timestamp + 1000,
    });
    setGapTarget(null);
    await refreshLocalData();
  };

  const removeCheckpoint = (checkpointId: number) => {
    Alert.alert('Remove this checkpoint?', undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await localDb.deleteCheckpoint(checkpointId);
          await refreshLocalData();
        },
      },
    ]);
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.mapBox}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              showsBuildings
              // fitToCoordinates needs the map laid out; onMapReady is the earliest safe moment.
              onMapReady={() => fitRoute(mapRef.current, points)}
            >
              <RouteTrace points={points} checkpoints={rec.checkpoints} />
            </MapView>
          </View>

          {preview.ok ? (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDistance(uploadLengthMeters(preview.upload))} ·{' '}
              {formatDuration(preview.upload.duration_s)} · {preview.upload.checkpoints.length}{' '}
              checkpoint(s) will be shared
            </ThemedText>
          ) : null}

          {rec.lastError && rec.status === 'pending' ? (
            <Banner tone="warn" text={`Not uploaded yet: ${rec.lastError}`} />
          ) : null}
          {uploaded ? (
            <Banner tone="ok" text="Uploaded — other people can find this route." />
          ) : null}

          {/* GPS gaps → ask for a checkpoint */}
          {!uploaded && gaps.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">GPS gaps (dashed on the map)</ThemedText>
              {gaps.map((gap, i) => {
                const from = points[gap.fromIndex]!;
                const to = points[gap.toIndex]!;
                const done = gapHasCheckpoint(from.timestamp, to.timestamp);
                return (
                  <ThemedView key={i} type="backgroundElement" style={styles.gapCard}>
                    <ThemedText type="small">
                      {done ? '✓ ' : ''}No GPS for {Math.round(gap.seconds)} s (about{' '}
                      {formatDistance(gap.meters)}).{' '}
                      {done ? 'Checkpoint added.' : 'What did you do here?'}
                    </ThemedText>
                    {!done ? (
                      <View style={styles.kindRow}>
                        {GAP_CHECKPOINT_KINDS.map((kind) => (
                          <Pressable
                            key={kind}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${CHECKPOINT_INFO[kind].en} at this gap`}
                            onPress={() => {
                              setGapTarget(from);
                              setSheetKind(kind);
                            }}
                            style={styles.kindChip}
                          >
                            <MaterialCommunityIcons
                              name={CHECKPOINT_INFO[kind].icon}
                              size={18}
                              color={BLUE}
                            />
                            <ThemedText type="small">{CHECKPOINT_INFO[kind].en}</ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </ThemedView>
                );
              })}
            </View>
          ) : null}

          {rec.checkpoints.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Checkpoints</ThemedText>
              {rec.checkpoints.map((c) => (
                <View key={c.id} style={styles.cpRow}>
                  <MaterialCommunityIcons
                    name={CHECKPOINT_INFO[c.kind].icon}
                    size={20}
                    color={BLUE}
                  />
                  <ThemedText style={styles.flex1}>{describeCheckpoint(c)}</ThemedText>
                  {!uploaded ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${describeCheckpoint(c)}`}
                      onPress={() => removeCheckpoint(c.id)}
                      hitSlop={10}
                      style={styles.iconButton}
                    >
                      <MaterialCommunityIcons name="delete" size={20} color={theme.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <Field label="Title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={titlePlaceholder}
              placeholderTextColor={theme.textSecondary}
              maxLength={80}
              style={inputStyle}
              accessibilityLabel="Title"
            />
          </Field>
          <Field label="Starts at">
            <TextInput
              value={startLabel}
              onChangeText={setStartLabel}
              placeholder="e.g. Kowloon Tong Exit C1"
              placeholderTextColor={theme.textSecondary}
              maxLength={80}
              style={inputStyle}
              accessibilityLabel="Start label"
            />
          </Field>
          <Field label="Ends at">
            <TextInput
              value={endLabel}
              onChangeText={setEndLabel}
              placeholder="e.g. CityU AC2"
              placeholderTextColor={theme.textSecondary}
              maxLength={80}
              style={inputStyle}
              accessibilityLabel="End label"
            />
          </Field>
          <Field label="Describe the route in your own words (English, 廣東話 or both)">
            <TextInput
              value={description}
              onChangeText={setDescription}
              editable={!uploaded}
              placeholder={
                'e.g. From MTR Exit C walk into Festival Walk, take the lift to L2, covered all the way.\n' +
                '例如：由港鐵C出口行入又一城，搭𨋢上L2，全程有冷氣。'
              }
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
              style={[...inputStyle, styles.multiline]}
              accessibilityLabel="Description"
            />
          </Field>

          <ToggleRow
            label="Show my name on this route"
            hint="Off: the route is shared anonymously."
            value={showAuthor}
            onChange={setShowAuthor}
          />
          <ToggleRow
            label="Hide the first and last 50 m"
            hint="Recommended if the route starts or ends at your home or office."
            value={trimEnds}
            onChange={setTrimEnds}
            disabled={uploaded}
          />

          {error ? <Banner tone="error" text={error} /> : null}
          {!uploaded && !preview.ok && !error ? <Banner tone="warn" text={preview.error} /> : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => save(false)}
            style={[styles.primary, busy && styles.disabled]}
          >
            <ThemedText style={styles.primaryText}>
              {uploaded ? 'Save changes' : 'Save & upload'}
            </ThemedText>
          </Pressable>
          {dataCollection && !uploaded ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => save(true)}
              style={[styles.primary, styles.primaryAlt, busy && styles.disabled]}
            >
              <ThemedText style={styles.primaryText}>Save & record another</ThemedText>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={remove} style={styles.deleteButton}>
            <ThemedText style={styles.deleteText}>Delete route</ThemedText>
          </Pressable>
        </ScrollView>

        <CheckpointSheet
          kind={sheetKind}
          onCancel={() => {
            setSheetKind(null);
            setGapTarget(null);
          }}
          onAdd={(details) => {
            const kind = sheetKind;
            setSheetKind(null);
            if (kind) void addGapCheckpoint(kind, details);
          }}
        />
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

/** Zooms the small review map to show the whole route. */
function fitRoute(map: MapView | null, points: readonly LatLng[]) {
  if (!map || points.length < 2) return;
  map.fitToCoordinates(
    points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false },
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex1}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Banner({ tone, text }: { tone: 'ok' | 'warn' | 'error'; text: string }) {
  const bg =
    tone === 'ok'
      ? 'rgba(46,125,50,0.12)'
      : tone === 'warn'
        ? 'rgba(230,81,0,0.12)'
        : 'rgba(198,40,40,0.12)';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <ThemedText type="small">{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  mapBox: { height: 240, borderRadius: Spacing.three, overflow: 'hidden' },
  section: { gap: Spacing.two },
  gapCard: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  kindChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    borderRadius: 20,
    backgroundColor: 'rgba(21,101,192,0.1)',
  },
  cpRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { gap: Spacing.one },
  input: {
    minHeight: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  multiline: { minHeight: 120, paddingTop: Spacing.three, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  banner: { padding: Spacing.three, borderRadius: Spacing.two },
  primary: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAlt: { backgroundColor: '#2E7D32' },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  deleteButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#C62828' },
});
