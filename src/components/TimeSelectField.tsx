import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../theme/colors';
import { formatHm, parseHm } from '../utils/localDateTime';

const ITEM_H = 44;
const VISIBLE_ROWS = 5;
const PICKER_H = ITEM_H * VISIBLE_ROWS;
const WHEEL_PAD = ITEM_H * Math.floor(VISIBLE_ROWS / 2);

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_LABELS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

type Props = {
  value: string;
  onChange: (hm: string) => void;
  wheelAnchor?: string;
  /** 提交成功跳转等场景：禁止打开并关闭已打开的滚轮，避免 Android Modal 与路由卸载竞态崩溃 */
  disabled?: boolean;
};

type WheelColumnProps = {
  labels: readonly string[];
  initialIndex: number;
  wheelId: number;
  onCommitted: (index: number) => void;
};

function clampIndex(i: number, len: number) {
  return Math.min(len - 1, Math.max(0, i));
}

const WheelColumn = memo(function WheelColumn({
  labels,
  initialIndex,
  wheelId,
  onCommitted,
}: WheelColumnProps) {
  const listRef = useRef<FlatList<string>>(null);
  const committedRef = useRef(initialIndex);

  useEffect(() => {
    committedRef.current = initialIndex;
    const y = initialIndex * ITEM_H;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: y, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [wheelId]);

  const commitOffset = useCallback(
    (y: number) => {
      const i = clampIndex(Math.round(y / ITEM_H), labels.length);
      if (i === committedRef.current) return;
      committedRef.current = i;
      onCommitted(i);
    },
    [labels.length, onCommitted],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitOffset(e.nativeEvent.contentOffset.y);
    },
    [commitOffset],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS === 'ios') return;
      commitOffset(e.nativeEvent.contentOffset.y);
    },
    [commitOffset],
  );

  return (
    <FlatList
      ref={listRef}
      data={labels as string[]}
      keyExtractor={(_, i) => String(i)}
      getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
      style={styles.wheelCol}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      contentContainerStyle={styles.wheelListContent}
      renderItem={({ item }) => (
        <View style={styles.wheelItemWrap}>
          <Text style={styles.wheelItemText}>{item}</Text>
        </View>
      )}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollEndDrag={onScrollEndDrag}
    />
  );
});

type TimePickerSheetProps = {
  visible: boolean;
  hour: number;
  minute: number;
  wheelId: number;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const MODAL_UNMOUNT_MS = Platform.OS === 'android' ? 320 : 0;

const TimePickerSheet = memo(function TimePickerSheet({
  visible,
  hour,
  minute,
  wheelId,
  onHour,
  onMinute,
  onCancel,
  onConfirm,
}: TimePickerSheetProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (visible || !mounted) return;
    const id = setTimeout(() => setMounted(false), MODAL_UNMOUNT_MS);
    return () => clearTimeout(id);
  }, [visible, mounted]);

  if (!mounted) return null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onCancel} accessibilityRole="button" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('pickTime')}</Text>

          <View style={styles.wheelsRow}>
            <View pointerEvents="none" style={styles.wheelSelectionBand} />
            <WheelColumn
              labels={HOUR_LABELS}
              initialIndex={hour}
              wheelId={wheelId}
              onCommitted={onHour}
            />
            <Text style={styles.wheelSep}>:</Text>
            <WheelColumn
              labels={MINUTE_LABELS}
              initialIndex={minute}
              wheelId={wheelId}
              onCommitted={onMinute}
            />
          </View>

          <Text style={styles.preview}>
            {t('timePickerSelected')}: {formatHm(hour, minute)}
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.secondaryBtn}>
              <Text style={styles.secondaryText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{t('requestPickerDone')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export function TimeSelectField({ value, onChange, wheelAnchor, disabled = false }: Props) {
  const parsed = useMemo(() => parseHm(value), [value]);
  const displayHm = useMemo(() => formatHm(parsed.hour, parsed.minute), [parsed.hour, parsed.minute]);

  const [visible, setVisible] = useState(false);
  const [wheelId, setWheelId] = useState(0);
  const [draftHour, setDraftHour] = useState(parsed.hour);
  const [draftMinute, setDraftMinute] = useState(parsed.minute);

  useEffect(() => {
    if (disabled) setVisible(false);
  }, [disabled]);

  const open = useCallback(() => {
    if (disabled) return;
    const anchor = parseHm(wheelAnchor?.trim() || value);
    setDraftHour(anchor.hour);
    setDraftMinute(anchor.minute);
    setWheelId((id) => id + 1);
    setVisible(true);
  }, [disabled, value, wheelAnchor]);

  const close = useCallback(() => setVisible(false), []);

  const confirm = useCallback(() => {
    onChange(formatHm(draftHour, draftMinute));
    setVisible(false);
  }, [onChange, draftHour, draftMinute]);

  return (
    <>
      <Pressable onPress={open} style={styles.trigger}>
        <Text style={styles.triggerText}>{displayHm}</Text>
        <Ionicons color={colors.primary} name="time-outline" size={20} />
      </Pressable>

      <TimePickerSheet
        visible={visible}
        hour={draftHour}
        minute={draftMinute}
        wheelId={wheelId}
        onHour={setDraftHour}
        onMinute={setDraftMinute}
        onCancel={close}
        onConfirm={confirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FAFBFD',
  },
  triggerText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as const } : {}),
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  overlayTap: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: PICKER_H,
    position: 'relative',
  },
  wheelSelectionBand: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: WHEEL_PAD,
    height: ITEM_H,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  wheelCol: {
    width: 72,
    height: PICKER_H,
  },
  wheelListContent: {
    paddingVertical: WHEEL_PAD,
  },
  wheelItemWrap: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as const } : {}),
  },
  wheelSep: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginHorizontal: 4,
    marginBottom: 2,
  },
  preview: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  actions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryText: { fontWeight: '800', color: colors.text },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  primaryText: { fontWeight: '800', color: '#fff' },
});
