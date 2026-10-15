/**
 * Full-screen sheet for choosing a start or destination:
 *   1. "My current location" (start only)
 *   2. Free-text search (via the `geocode` Edge Function) — runs when you press Search
 *   3. Demo landmarks (MTR exits, Festival Walk, CityU buildings), filtered as you type
 */
import { PRESET_KIND_LABELS, PRESETS, type GeocodeResult, type Preset } from '@scenic/shared';
import { useMutation } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { geocode } from '@/lib/api';

import type { Place } from './types';

type Row = { key: string; title: string; subtitle?: string; place: Place };

export function PlacePicker({
  visible,
  title,
  allowCurrentLocation,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  allowCurrentLocation: boolean;
  onPick: (place: Place) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Free-text search only runs on "Search" so we don't spend API quota on every keystroke.
  const search = useMutation({ mutationFn: (query: string) => geocode(query) });

  // Landmarks filtered by the typed text (English or Chinese), grouped by kind.
  const sections = useMemo(() => {
    const q = text.trim().toLowerCase();
    const matches = (p: Preset) => !q || p.en.toLowerCase().includes(q) || p.zh.includes(q);

    const out: { title: string; data: Row[] }[] = [];
    if (search.data && search.data.length > 0) {
      out.push({
        title: 'Search results',
        data: search.data.map((r: GeocodeResult, i) => ({
          key: `search-${i}`,
          title: r.label,
          place: { label: r.label, point: r.point },
        })),
      });
    }
    for (const kind of Object.keys(PRESET_KIND_LABELS) as (keyof typeof PRESET_KIND_LABELS)[]) {
      const rows = PRESETS.filter((p) => p.kind === kind && matches(p)).map((p) => ({
        key: p.id,
        title: p.en,
        subtitle: p.zh,
        place: { label: p.en, point: p.point, presetId: p.id },
      }));
      if (rows.length > 0) out.push({ title: PRESET_KIND_LABELS[kind].en, data: rows });
    }
    return out;
  }, [text, search.data]);

  const pick = (place: Place) => {
    setText('');
    search.reset();
    onPick(place);
  };

  const pickCurrentLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setLocationError('Location permission is off. Turn it on in your phone settings.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      pick({
        label: 'My location',
        point: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    } catch {
      setLocationError('Could not get your location. Try again outdoors.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.headerTitle}>
              {title}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
            >
              <ThemedText type="linkPrimary">Close</ThemedText>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Search a place or landmark"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              onSubmitEditing={() => text.trim().length >= 2 && search.mutate(text.trim())}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
              accessibilityLabel="Search places"
            />
            <Pressable
              accessibilityRole="button"
              disabled={text.trim().length < 2 || search.isPending}
              onPress={() => search.mutate(text.trim())}
              style={styles.searchButton}
            >
              {search.isPending ? (
                <ActivityIndicator />
              ) : (
                <ThemedText type="linkPrimary">Search</ThemedText>
              )}
            </Pressable>
          </View>
          {search.error ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              Search unavailable: {search.error.message} You can still pick a landmark below.
            </ThemedText>
          ) : null}
          {search.data && search.data.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              No places found for “{text.trim()}”.
            </ThemedText>
          ) : null}

          {allowCurrentLocation ? (
            <Pressable
              accessibilityRole="button"
              onPress={pickCurrentLocation}
              disabled={locating}
              style={styles.row}
            >
              <ThemedText>📍 My current location</ThemedText>
              {locating ? <ActivityIndicator /> : null}
            </Pressable>
          ) : null}
          {locationError ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              {locationError}
            </ThemedText>
          ) : null}

          <SectionList
            sections={sections}
            keyExtractor={(row) => row.key}
            keyboardShouldPersistTaps="handled"
            renderSectionHeader={({ section }) => (
              <ThemedView style={styles.sectionHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {section.title}
                </ThemedText>
              </ThemedView>
            )}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
                onPress={() => pick(item.place)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <View style={styles.rowText}>
                  <ThemedText>{item.title}</ThemedText>
                  {item.subtitle ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.subtitle}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { flex: 1, fontSize: 24, lineHeight: 32 },
  close: { minHeight: 44, justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  searchButton: { minHeight: 44, minWidth: 60, alignItems: 'center', justifyContent: 'center' },
  message: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  sectionHeader: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: { flex: 1, gap: 2 },
});
