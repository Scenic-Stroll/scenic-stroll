/**
 * My routes: everything recorded on this phone — drafts, routes waiting to upload, uploaded.
 * The header shows the upload queue and lets you push it manually.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { formatDistance } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { listRecordings, type RecordingSummary } from '@/lib/local-db';
import { localKeys } from '@/lib/query-client';
import { processUploadQueue } from '@/lib/upload-queue';

const STATUS_LOOK: Record<RecordingSummary['status'], { label: string; color: string }> = {
  recording: { label: 'Recording', color: '#C62828' },
  draft: { label: 'Not saved yet', color: '#757575' },
  pending: { label: 'Waiting to upload', color: '#E65100' },
  uploaded: { label: 'Uploaded', color: '#2E7D32' },
};

/** `header` is shown above the list and scrolls with it (the Routes tab puts its title + tabs there). */
export function MyRoutes({ header }: { header?: ReactNode }) {
  const recordings = useQuery({ queryKey: localKeys.recordings, queryFn: listRecordings });
  const net = useNetInfo();
  const [uploading, setUploading] = useState(false);

  const pending = recordings.data?.filter((r) => r.status === 'pending').length ?? 0;
  const offline = net.isConnected === false;

  const uploadNow = async () => {
    setUploading(true);
    await processUploadQueue();
    setUploading(false);
  };

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        <FlatList
          data={recordings.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              {header}
              {pending > 0 ? (
                <ThemedView type="backgroundElement" style={styles.queue}>
                  <MaterialCommunityIcons name="cloud-upload" size={22} color="#E65100" />
                  <ThemedText style={styles.flex1}>
                    {pending} waiting to upload
                    {offline ? ' — you’re offline, it will upload later' : ''}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    disabled={uploading}
                    onPress={uploadNow}
                    style={styles.uploadButton}
                  >
                    {uploading ? (
                      <ActivityIndicator />
                    ) : (
                      <ThemedText type="linkPrimary">Upload now</ThemedText>
                    )}
                  </Pressable>
                </ThemedView>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            recordings.isPending ? (
              <ActivityIndicator />
            ) : (
              <ThemedText themeColor="textSecondary">
                No routes yet. Use the Record tab to record your first one.
              </ThemedText>
            )
          }
          renderItem={({ item }) => <RouteRow item={item} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function RouteRow({ item }: { item: RecordingSummary }) {
  const look = STATUS_LOOK[item.status];
  const date = new Date(item.startedAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title ?? 'Untitled route'}, ${look.label}`}
      onPress={() => router.push({ pathname: '/recording/[id]', params: { id: item.id } })}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <ThemedView type="backgroundElement" style={styles.row}>
        <View style={styles.flex1}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.title ?? 'Untitled route — tap to review'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {date.toLocaleDateString()}{' '}
            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {formatDistance(item.distanceM)}
          </ThemedText>
          {item.lastError && item.status === 'pending' ? (
            <ThemedText type="small" style={styles.error} numberOfLines={2}>
              {item.lastError}
            </ThemedText>
          ) : null}
        </View>
        <View style={[styles.status, { backgroundColor: look.color }]}>
          <ThemedText type="small" style={styles.statusText}>
            {look.label}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  queue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  uploadButton: { minHeight: 44, minWidth: 90, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 64,
  },
  pressed: { opacity: 0.6 },
  error: { color: '#E65100' },
  status: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 10 },
  statusText: { color: '#fff' },
});
