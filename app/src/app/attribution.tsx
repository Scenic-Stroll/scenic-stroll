import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListRow } from '@/components/ui/list-row';
import { CREDITS } from '@/content/attribution';
import { space, type, useAppTheme } from '@/theme';

/** Data sources & credits (Profile → About, and the welcome screen on the web). */
export default function Attribution() {
  const t = useAppTheme();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.content}>
      <Text style={[type.body, styles.intro, { color: t.textPrimary }]}>
        Scenic Stroll is built on open data. Thank you to everyone who makes it available.
      </Text>
      <View>
        {CREDITS.map((c) => (
          <ListRow key={c.title} icon={c.icon} title={c.title} subtitle={c.credit} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: space.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  intro: { paddingHorizontal: space.lg, marginBottom: space.sm },
});
