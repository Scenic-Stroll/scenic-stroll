// Renders a text page (privacy policy, terms) from src/content/. Plain text in data files, so the
// team can edit the wording without touching layout code.
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Doc } from '@/content/types';
import { radius, space, type, useAppTheme } from '@/theme';

export function DocPage({ doc }: { doc: Doc }) {
  const t = useAppTheme();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.content}>
      {doc.draftNote ? (
        <View
          style={[styles.draft, { backgroundColor: t.warningSurface, borderColor: t.warning }]}
          accessibilityRole="alert"
        >
          <Text style={[type.small, { color: t.textPrimary }]}>{doc.draftNote}</Text>
        </View>
      ) : null}
      <Text style={[type.caption, { color: t.textSecondary }]}>Last updated {doc.updated}</Text>
      {doc.intro ? <Text style={[type.body, { color: t.textPrimary }]}>{doc.intro}</Text> : null}
      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
            {section.heading}
          </Text>
          {section.body.map((part, i) =>
            typeof part === 'string' ? (
              <Text key={i} style={[type.body, { color: t.textPrimary }]}>
                {part}
              </Text>
            ) : (
              <View key={i} style={styles.list}>
                {part.map((item) => (
                  <View key={item} style={styles.item}>
                    <Text style={[type.body, { color: t.textSecondary }]}>•</Text>
                    <Text style={[type.body, styles.itemText, { color: t.textPrimary }]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  draft: { padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  section: { gap: space.sm, marginTop: space.sm },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  itemText: { flex: 1 },
});
