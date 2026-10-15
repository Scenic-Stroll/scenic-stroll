/**
 * Location sharing settings: who (all friends / chosen), how long (15 min / 1 h / until I stop) and
 * precision (exact / approximate ~200 m). Off by default; foreground only.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { useFriendList } from '@/lib/friends';
import {
  agoLabel,
  startSharing,
  stopSharing,
  useSharing,
  type ShareSettings,
} from '@/lib/location-sharing';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

const WHO = [
  { key: 'all', label: 'All friends' },
  { key: 'selected', label: 'Choose' },
] as const;
const HOW_LONG = [
  { key: '15', label: '15 min' },
  { key: '60', label: '1 hour' },
  { key: 'forever', label: 'Until I stop' },
] as const;
const PRECISION = [
  { key: 'approximate', label: 'Approximate' },
  { key: 'exact', label: 'Exact' },
] as const;

export function ShareLocationSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const t = useAppTheme();
  const sharing = useSharing();
  const friends = (useFriendList().data ?? []).filter((f) => f.kind === 'friend');
  const [settings, setSettings] = useState<ShareSettings>(sharing.settings);
  const [error, setError] = useState<string | null>(null);
  const on = sharing.status === 'on';

  const toggleRecipient = (id: string) =>
    setSettings((s) => ({
      ...s,
      recipients: s.recipients.includes(id)
        ? s.recipients.filter((r) => r !== id)
        : [...s.recipients, id],
    }));

  const start = async () => {
    setError(null);
    const message = await startSharing(settings);
    if (message) setError(message);
    else onClose();
  };

  return (
    <View style={[styles.backdrop, { backgroundColor: t.overlay }]}>
      <View style={[styles.sheet, { backgroundColor: t.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
            Share my location
          </Text>
          {on ? (
            <View style={[styles.status, { backgroundColor: t.surface }]}>
              <Icon name="access-point" size={20} color={t.primary} />
              <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
                Sharing now
                {sharing.expiresAt
                  ? ` until ${new Date(sharing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ' until you stop'}
                {sharing.lastSentAt ? ` · updated ${agoLabel(sharing.lastSentAt)}` : ''}
              </Text>
            </View>
          ) : null}

          <Text style={[type.body, styles.label, { color: t.textPrimary }]}>Who can see it</Text>
          <SegmentedTabs
            options={WHO}
            value={settings.audience}
            onChange={(audience) => setSettings((s) => ({ ...s, audience }))}
          />
          {settings.audience === 'selected' ? (
            friends.length === 0 ? (
              <Text style={[type.small, { color: t.textSecondary }]}>
                You have no friends to choose yet.
              </Text>
            ) : (
              friends.map((f) => {
                const checked = settings.recipients.includes(f.other_id);
                return (
                  <Pressable
                    key={f.other_id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={f.name}
                    onPress={() => toggleRecipient(f.other_id)}
                    style={styles.friendRow}
                  >
                    <Avatar name={f.name} size={32} />
                    <Text style={[type.body, styles.flex1, { color: t.textPrimary }]}>
                      {f.name}
                    </Text>
                    <Icon
                      name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                      size={24}
                      color={checked ? t.primary : t.textSecondary}
                    />
                  </Pressable>
                );
              })
            )
          ) : null}

          <Text style={[type.body, styles.label, { color: t.textPrimary }]}>For how long</Text>
          <SegmentedTabs
            options={HOW_LONG}
            value={settings.minutes === null ? 'forever' : settings.minutes === 15 ? '15' : '60'}
            onChange={(k) =>
              setSettings((s) => ({ ...s, minutes: k === 'forever' ? null : Number(k) }))
            }
          />

          <Text style={[type.body, styles.label, { color: t.textPrimary }]}>Precision</Text>
          <SegmentedTabs
            options={PRECISION}
            value={settings.precision}
            onChange={(precision) => setSettings((s) => ({ ...s, precision }))}
          />
          <Text style={[type.caption, { color: t.textSecondary }]}>
            Approximate rounds your position to about 200 m on your phone before it’s sent — your
            exact location never leaves the phone.
          </Text>

          <View style={[styles.note, { backgroundColor: t.surface }]}>
            <Icon name="shield-lock-outline" size={20} color={t.textSecondary} />
            <Text style={[type.small, styles.flex1, { color: t.textSecondary }]}>
              Only while the app is open (no background tracking). Friends stop seeing you when you
              stop, when time runs out, or 30 minutes after your last update.
            </Text>
          </View>

          {error ? (
            <Text style={[type.small, { color: t.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            label={on ? 'Update sharing' : 'Start sharing'}
            icon="map-marker-account"
            onPress={() => void start()}
            loading={sharing.status === 'starting'}
            disabled={settings.audience === 'selected' && settings.recipients.length === 0}
          />
          {on ? (
            <PrimaryButton
              label="Stop sharing"
              icon="stop-circle-outline"
              variant="danger"
              onPress={() => {
                void stopSharing();
                onClose();
              }}
            />
          ) : null}
          <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  content: { padding: space.xl, gap: space.md },
  flex1: { flex: 1 },
  label: { fontWeight: '600', marginTop: space.sm },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP_TARGET },
  note: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
});
