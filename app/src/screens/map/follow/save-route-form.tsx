/**
 * "Save as a community route": the walk you just finished (the planned line, incl. any re-plans)
 * becomes an unverified community route others can find and confirm by walking it.
 * Anonymous unless you choose to show your name. BottomSheetTextInput keeps the fields above the
 * keyboard inside the bottom sheet.
 */
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import type { FollowSession } from '@/lib/follow-store';
import { useSettings } from '@/lib/settings-store';
import { savePlannedRoute, walkedRoute } from '@/lib/walk-feedback';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

export function SaveRouteForm({
  session,
  onSaved,
}: {
  session: FollowSession;
  onSaved: () => void;
}) {
  const t = useAppTheme();
  const showNameByDefault = useSettings((st) => st.showNameByDefault);
  const [title, setTitle] = useState(`${session.originLabel} to ${session.destinationLabel}`);
  const [description, setDescription] = useState('');
  const [showName, setShowName] = useState(showNameByDefault);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Made once, so pressing Save twice (or retrying) can't create two routes.
  const [routeId] = useState(() => randomUUID());

  const save = () => {
    setSaving(true);
    setError(null);
    const walked = walkedRoute(session);
    savePlannedRoute({
      id: routeId,
      title,
      startLabel: session.originLabel,
      endLabel: session.destinationLabel,
      description,
      showAuthor: showName,
      line: walked.line,
      durationS: session.route.duration_s,
      markers: session.route.option?.markers ?? [],
    })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const input = [
    type.body,
    styles.input,
    { color: t.textPrimary, backgroundColor: t.background, borderColor: t.border },
  ];

  return (
    <View style={[styles.box, { backgroundColor: t.surface }]}>
      <Text style={[type.body, styles.bold, { color: t.textPrimary }]}>
        Save as a community route
      </Text>
      <BottomSheetTextInput
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        style={input}
        accessibilityLabel="Route title"
      />
      <BottomSheetTextInput
        value={description}
        onChangeText={setDescription}
        placeholder={'Anything others should know? (optional)\n例如：落雨都唔會濕，有冷氣。'}
        placeholderTextColor={t.textSecondary}
        multiline
        maxLength={2000}
        style={[...input, styles.multiline]}
        accessibilityLabel="Description (optional)"
      />
      <View style={styles.toggle}>
        <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
          Show my name on this route
        </Text>
        <Switch value={showName} onValueChange={setShowName} accessibilityLabel="Show my name" />
      </View>
      <Text style={[type.caption, { color: t.textSecondary }]}>
        It starts where you started ({session.originLabel}) and shows as “Unverified” until other
        walkers confirm it.
      </Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.small, { color: t.danger }]}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Save route" icon="content-save" loading={saving} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  bold: { fontWeight: '600' },
  flex1: { flex: 1 },
  input: {
    minHeight: TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  multiline: { minHeight: 80, paddingTop: space.sm, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TAP_TARGET },
});
