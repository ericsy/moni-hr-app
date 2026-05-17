import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../src/context/AuthContext';
import { colors } from '../../../src/theme/colors';

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function ClockScreen() {
  const { t } = useTranslation();
  const { clockEvents, punch } = useAuth();

  const last = clockEvents[clockEvents.length - 1];
  const nextKind = useMemo(() => {
    if (!last) return 'in' as const;
    return last.type === 'in' ? ('out' as const) : ('in' as const);
  }, [last]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('clockTitle')}</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.ring}>
          <Text style={styles.ringLabel}>{nextKind === 'in' ? t('clockIn') : t('clockOut')}</Text>
          <Text style={styles.ringHint}>{t('clockHint')}</Text>
        </View>

        <Pressable
          onPress={() => punch(nextKind)}
          style={({ pressed }) => [styles.bigBtn, pressed && styles.bigBtnPressed]}
        >
          <Text style={styles.bigBtnText}>{nextKind === 'in' ? t('clockIn') : t('clockOut')}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>{t('timeline')}</Text>
      <FlatList
        contentContainerStyle={styles.list}
        data={[...clockEvents].reverse()}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>—</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.dot, item.type === 'in' ? styles.dotIn : styles.dotOut]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.type === 'in' ? t('clockedIn') : t('clockedOut')}</Text>
              <Text style={styles.rowMeta}>{formatTime(item.at)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 4 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  hero: { paddingHorizontal: 20, paddingTop: 18, alignItems: 'center' },
  ring: {
    width: '100%',
    borderRadius: 20,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ringLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  ringHint: { marginTop: 8, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  bigBtn: {
    marginTop: 16,
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  bigBtnPressed: { backgroundColor: colors.primaryDark },
  bigBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  section: { marginTop: 18, paddingHorizontal: 20, fontSize: 13, fontWeight: '800', color: colors.textMuted },
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 10, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 999 },
  dotIn: { backgroundColor: colors.success },
  dotOut: { backgroundColor: colors.primary },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rowMeta: { marginTop: 2, color: colors.textMuted, fontSize: 13 },
  empty: { color: colors.textMuted, paddingHorizontal: 20, paddingTop: 8 },
});
