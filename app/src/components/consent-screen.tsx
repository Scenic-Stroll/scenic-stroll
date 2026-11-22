// First launch (and when the consent text changes): one screen with what Scenic Stroll is, the age
// band, the consent and two optional data-sharing choices. Shown over everything except the
// privacy / terms pages it links to. D52.
import { router, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { saveConsent, useUserSettings } from '@/lib/user-settings';
import { useAuth } from '@/providers/auth-provider';
import { needsConsent, type AgeBand } from '@scenic/shared';
import { radius, space, type, useAppTheme } from '@/theme';

const PAGES_IT_LINKS_TO = ['/privacy', '/terms', '/attribution'];

export function ConsentGate() {
  const auth = useAuth();
  const { settings, known } = useUserSettings();
  const pathname = usePathname();
  if (auth.status !== 'signed-in' || PAGES_IT_LINKS_TO.includes(pathname)) return null;
  // Wait for the answer from the server (or the copy on the device) before asking.
  if (!known && settings === null) return null;
  if (!needsConsent(settings)) return null;
  return <ConsentScreen userId={auth.session.user.id} />;
}

function ConsentScreen({ userId }: { userId: string }) {
  const t = useAppTheme();
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [research, setResearch] = useState(false);
  const [government, setGovernment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!ageBand) return;
    setSaving(true);
    setError(null);
    try {
      await saveConsent(userId, {
        ageBand,
        researchOptIn: research,
        govSharingOptIn: government,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.backdrop, { backgroundColor: t.overlay }]}>
      <ScrollView contentContainerStyle={styles.scroll} accessibilityViewIsModal>
        <View style={[styles.card, { backgroundColor: t.background }]}>
          <View style={styles.titleRow}>
            <View style={[styles.logo, { backgroundColor: t.accent }]}>
              <Icon name="map-marker-path" size={28} color="#FFFFFF" />
            </View>
            <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
              Scenic Stroll
            </Text>
            <View
              style={[styles.beta, { backgroundColor: t.warningSurface, borderColor: t.warning }]}
            >
              <Text style={[type.caption, styles.bold, { color: t.textPrimary }]}>BETA</Text>
            </View>
          </View>

          <Text style={[type.body, { color: t.textPrimary }]}>
            Find the shaded, sheltered or step-free way to walk, and collect short, checked notes
            about the places you pass.
          </Text>
          <View style={[styles.box, { backgroundColor: t.surface }]}>
            <Text style={[type.small, { color: t.textPrimary }]}>
              <Text style={styles.bold}>Smart walking routes:</Text> CityU, Kowloon Tong MTR and
              Festival Walk.
            </Text>
            <Text style={[type.small, { color: t.textPrimary }]}>
              <Text style={styles.bold}>Transport comparison:</Text> all of Hong Kong.
            </Text>
          </View>

          <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
            How old are you?
          </Text>
          <View accessibilityRole="radiogroup" style={styles.choices}>
            <Choice selected={ageBand === 'under_18'} onPress={() => setAgeBand('under_18')}>
              Under 18
            </Choice>
            <Choice selected={ageBand === 'adult'} onPress={() => setAgeBand('adult')}>
              18 or over
            </Choice>
          </View>
          {ageBand === 'under_18' ? (
            <Text style={[type.small, { color: t.textSecondary }]}>
              Safety mode will be on: no route recording and no friends, and the pins you collect
              stay on this device. You can still plan routes and read pins.
            </Text>
          ) : null}

          <Tick checked={agreed} onPress={() => setAgreed(!agreed)}>
            I agree to the privacy policy and terms (drafts). My location is used on this device to
            show where I am and to collect pins.
          </Tick>
          <View style={styles.links}>
            <Link onPress={() => router.push('/privacy')}>Privacy policy</Link>
            <Link onPress={() => router.push('/terms')}>Terms</Link>
          </View>

          {ageBand === 'adult' ? (
            <>
              <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>
                Optional — you can change these later
              </Text>
              <Tick checked={research} onPress={() => setResearch(!research)}>
                Research: the team may use my anonymous walking data in university studies.
              </Tick>
              <Tick checked={government} onPress={() => setGovernment(!government)}>
                Government: anonymous walking data may be shared with Hong Kong government
                departments to improve walkways.
              </Tick>
            </>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={[type.small, { color: t.danger }]}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label="Start"
            icon="walk"
            disabled={!ageBand || !agreed || saving}
            loading={saving}
            onPress={() => void start()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Choice({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: string;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={children}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.successSurface : t.background,
        },
      ]}
    >
      <Icon
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={22}
        color={selected ? t.primary : t.textSecondary}
      />
      <Text style={[type.body, { color: t.textPrimary }]}>{children}</Text>
    </Pressable>
  );
}

function Tick({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.tick}
    >
      <Icon
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={checked ? t.primary : t.textSecondary}
      />
      <Text style={[type.small, styles.flex, { color: t.textPrimary }]}>{children}</Text>
    </Pressable>
  );
}

function Link({ onPress, children }: { onPress: () => void; children: string }) {
  const t = useAppTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={6}>
      <Text style={[type.small, styles.underline, { color: t.primary }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 2000 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: radius.sheet,
    padding: space.xl,
    gap: space.md,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beta: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  bold: { fontWeight: '700' },
  box: { padding: space.md, borderRadius: radius.md, gap: space.xs },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  tick: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  links: { flexDirection: 'row', gap: space.lg, marginLeft: 32 },
  underline: { textDecorationLine: 'underline' },
});
