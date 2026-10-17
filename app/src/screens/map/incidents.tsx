/**
 * "Incidents" layer UI (multimodal step 5): a small banner under the search bar ("2 traffic
 * incidents · see list") and the list itself, in English and Chinese, from Transport Department
 * traffic news. Incidents with a position also get a pin on the map (in index.tsx); most TD
 * messages have no position, which is why the list is the main view.
 */
import { formatHkTime, type TrafficIncident } from '@scenic/shared';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

export function IncidentsBanner({
  incidents,
  loading,
  failed,
}: {
  incidents: TrafficIncident[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const count = incidents?.length ?? 0;
  const text = failed
    ? 'Traffic news unavailable right now'
    : loading && !incidents
      ? 'Checking traffic news…'
      : count === 0
        ? 'No road incidents reported right now'
        : `${count} road incident${count === 1 ? '' : 's'} · see list`;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        disabled={count === 0}
        onPress={() => setOpen(true)}
        style={[
          styles.banner,
          { backgroundColor: count > 0 ? t.warningSurface : t.background, borderColor: t.border },
        ]}
      >
        <Icon name="alert-outline" size={18} color={count > 0 ? t.warning : t.textSecondary} />
        <Text style={[type.small, styles.flex1, { color: t.textPrimary }]} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      <IncidentsList incidents={incidents ?? []} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function IncidentsList({
  incidents,
  visible,
  onClose,
}: {
  incidents: TrafficIncident[];
  visible: boolean;
  onClose: () => void;
}) {
  const t = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: t.overlay }]}
        onPress={onClose}
        accessibilityLabel="Close incidents"
      >
        {/* Inner Pressable stops taps on the card from closing it. */}
        <Pressable style={[styles.card, { backgroundColor: t.background }]} onPress={() => {}}>
          <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
            Road incidents · 交通事故
          </Text>
          <ScrollView contentContainerStyle={styles.list}>
            {incidents.map((i) => (
              <View key={i.id} style={[styles.item, { borderColor: t.border }]}>
                <Text style={[type.body, styles.strong, { color: t.textPrimary }]}>
                  {i.heading_en}
                  {i.location_en ? ` · ${i.location_en}` : ''}
                </Text>
                {i.heading_zh || i.location_zh ? (
                  <Text style={[type.small, { color: t.textSecondary }]}>
                    {[i.heading_zh, i.location_zh].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <Text style={[type.small, { color: t.textPrimary }]}>{i.content_en}</Text>
                {i.content_zh ? (
                  <Text style={[type.small, { color: t.textSecondary }]}>{i.content_zh}</Text>
                ) : null}
                <Text style={[type.caption, { color: t.textSecondary }]}>
                  {[
                    i.district_en,
                    i.direction_en,
                    i.announced_at ? `Announced ${formatHkTime(i.announced_at)}` : null,
                    i.point ? null : 'No map position given',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            Source: Transport Department special traffic news (DATA.GOV.HK). Refreshed every 2
            minutes.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: TAP_TARGET,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  flex1: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', padding: space.xl },
  card: { borderRadius: radius.sheet, padding: space.lg, gap: space.md, maxHeight: '80%' },
  list: { gap: space.md },
  item: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  strong: { fontWeight: '600' },
});
