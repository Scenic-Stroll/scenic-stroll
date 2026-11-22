// Reading a collected pin (D54): the version for the reader's reading style, the label badge
// ("Expert-verified" / "AI-summarized"), the sources with links, the "beyond Hong Kong" line, then
// an optional, ungraded "Guess, then see the answer" question. "Done reading" marks it read.
import { PIN_LABEL_TEXT, pickVersion, type PinQuestion, type ReadingLevel } from '@scenic/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useCollection } from '@/lib/pin-collection';
import { startReading } from '@/lib/pin-reading';
import { usePinContent } from '@/lib/pins';
import { useUserSettings } from '@/lib/user-settings';
import { radius, space, type, useAppTheme } from '@/theme';

const LEVEL_NAME: Record<ReadingLevel, string> = { child: 'Child', teen: 'Teen', adult: 'Adult' };

export function PinReader({ pinId }: { pinId: string }) {
  const t = useAppTheme();
  const collected = useCollection((s) => s.pins[pinId]);
  const content = usePinContent(collected ? pinId : undefined);
  const style = useUserSettings().settings?.reading_style ?? 'adult';
  const finish = useRef<((level: ReadingLevel) => Promise<number>) | null>(null);
  const [done, setDone] = useState(false);
  const [awarded, setAwarded] = useState(0);

  // The reading starts when the page opens (the server times it for points — phase 5).
  useEffect(() => {
    if (collected) finish.current = startReading(pinId);
  }, [collected, pinId]);

  if (!collected) {
    return (
      <View style={[styles.fill, { backgroundColor: t.background }]}>
        <EmptyState
          icon="lock-outline"
          title="Not in your collection yet"
          body="Walk past this pin (with directions or while recording) to save it, then read it here."
        />
      </View>
    );
  }
  if (content.isLoading) return <ActivityIndicator style={styles.pad} />;
  const pin = content.data;
  const version = pin ? pickVersion(pin.versions, style) : null;
  if (!pin || !version) {
    return (
      <View style={[styles.fill, { backgroundColor: t.background }]}>
        <EmptyState
          icon="cloud-off-outline"
          title="Can’t show this pin right now"
          body={
            content.error
              ? 'Check your connection and try again.'
              : 'It may have been paused for corrections.'
          }
        />
      </View>
    );
  }

  const markRead = async () => {
    setAwarded((await finish.current?.(version.reading_level)) ?? 0);
    setDone(true);
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
        {pin.title}
      </Text>
      <View style={styles.badges}>
        <View
          style={[
            styles.badge,
            { backgroundColor: pin.label === 'expert_verified' ? t.successSurface : t.infoSurface },
          ]}
        >
          <Icon
            name={pin.label === 'expert_verified' ? 'check-decagram' : 'robot-outline'}
            size={16}
            color={t.textPrimary}
          />
          <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>
            {PIN_LABEL_TEXT[pin.label]}
          </Text>
        </View>
        {pin.is_sample ? (
          <View style={[styles.badge, { backgroundColor: t.warningSurface }]}>
            <Text style={[type.small, { color: t.textPrimary }]}>Sample content</Text>
          </View>
        ) : null}
        {version.reading_level !== style ? (
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {LEVEL_NAME[version.reading_level]} version (no {LEVEL_NAME[style].toLowerCase()}{' '}
            version yet)
          </Text>
        ) : null}
      </View>

      <Text style={[type.body, styles.body, { color: t.textPrimary }]}>{version.body}</Text>

      <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
        Sources cited
      </Text>
      {pin.sources.map((s) => (
        <SourceLink key={s.url} title={s.title} url={s.url} openAccess={s.is_open_access} />
      ))}

      {pin.beyond_hk_text ? (
        <View style={[styles.beyond, { backgroundColor: t.surface }]}>
          <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>
            Why it matters beyond Hong Kong
          </Text>
          <Text style={[type.body, { color: t.textPrimary }]}>{pin.beyond_hk_text}</Text>
          {pin.beyond_hk_source ? (
            <SourceLink
              title={pin.beyond_hk_source.title}
              url={pin.beyond_hk_source.url}
              openAccess={pin.beyond_hk_source.is_open_access}
            />
          ) : null}
        </View>
      ) : null}

      {version.questions[0] ? <GuessQuestion question={version.questions[0]} /> : null}

      {done || collected.readAt ? (
        <Text accessibilityRole="alert" style={[type.small, { color: t.primary }]}>
          Marked as read.{awarded > 0 ? ` +${awarded} points` : ''}
        </Text>
      ) : (
        <PrimaryButton label="Done reading" icon="check" onPress={() => void markRead()} />
      )}
      <PrimaryButton
        label="Back to My collection"
        variant="secondary"
        onPress={() => router.navigate('/collection')}
      />
    </ScrollView>
  );
}

function SourceLink({
  title,
  url,
  openAccess,
}: {
  title: string;
  url: string;
  openAccess: boolean;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}${openAccess ? ', free to read' : ''}`}
      onPress={() => void Linking.openURL(url)}
      style={styles.source}
    >
      <Icon name="open-in-new" size={16} color={t.primary} />
      <Text style={[type.small, styles.flex, { color: t.primary }]}>{title}</Text>
      {openAccess ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>Free to read</Text>
      ) : null}
    </Pressable>
  );
}

/** Not graded: any answer reveals the right one and the explanation. */
function GuessQuestion({ question }: { question: PinQuestion }) {
  const t = useAppTheme();
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <View style={[styles.question, { borderColor: t.border }]}>
      <Text style={[type.small, styles.bold, { color: t.textSecondary }]}>
        Guess, then see the answer
      </Text>
      <Text style={[type.body, { color: t.textPrimary }]}>{question.prompt}</Text>
      {question.options.map((o) => {
        const isAnswer = picked !== null && o === question.answer;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityState={{ selected: picked === o }}
            onPress={() => setPicked(o)}
            style={[
              styles.option,
              {
                borderColor: isAnswer ? t.primary : t.border,
                backgroundColor: isAnswer ? t.successSurface : t.background,
              },
            ]}
          >
            <Text style={[type.body, { color: t.textPrimary }]}>
              {isAnswer ? '✓ ' : ''}
              {o}
            </Text>
          </Pressable>
        );
      })}
      {picked !== null ? (
        <Text accessibilityRole="alert" style={[type.small, { color: t.textPrimary }]}>
          {question.explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center' },
  pad: { padding: space.xl },
  page: { padding: space.lg, gap: space.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.round,
  },
  bold: { fontWeight: '700' },
  body: { lineHeight: 26 },
  source: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  beyond: { padding: space.md, borderRadius: radius.md, gap: space.xs },
  question: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  option: { borderWidth: 2, borderRadius: radius.md, padding: space.md },
});
