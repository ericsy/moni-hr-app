import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

export type AttendanceReviewPromptTarget = {
  approved: boolean;
};

type Props = {
  target: AttendanceReviewPromptTarget | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reviewComment: string) => void;
};

export function AttendanceReviewPrompt({ target, busy, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState('');
  const [showRequired, setShowRequired] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const visible = target != null;
  const approved = target?.approved ?? false;

  useEffect(() => {
    if (visible) {
      setComment('');
      setShowRequired(false);
      setKeyboardHeight(0);
    }
  }, [visible, approved]);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const title = approved
    ? t('requestReviewCommentPromptApprove')
    : t('requestReviewCommentPromptReject');

  const submit = () => {
    const trimmed = comment.trim();
    if (!trimmed) {
      setShowRequired(true);
      return;
    }
    onConfirm(trimmed);
  };

  const sheetBottomPad =
    Platform.OS === 'android'
      ? Math.max(16, keyboardHeight > 0 ? 12 : insets.bottom)
      : Math.max(16, insets.bottom);

  return (
    <Modal
      animationType="slide"
      onRequestClose={busy ? undefined : onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          style={styles.keyboardWrap}
        >
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: sheetBottomPad,
                marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
              },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.hint}>{t('requestReviewCommentRequiredHint')}</Text>
            <Text style={styles.label}>{t('requestReviewComment')}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.inputScroll}
            >
              <TextInput
                autoFocus
                editable={!busy}
                multiline
                onChangeText={(text) => {
                  setComment(text);
                  if (showRequired && text.trim()) setShowRequired(false);
                }}
                placeholder={t('requestReviewCommentPlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, showRequired && !comment.trim() && styles.inputError]}
                textAlignVertical="top"
                value={comment}
              />
            </ScrollView>
            {showRequired && !comment.trim() ? (
              <Text style={styles.errorText}>{t('requestReviewCommentRequired')}</Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                disabled={busy}
                onPress={onClose}
                style={[styles.cancelBtn, busy && styles.btnDisabled]}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={submit}
                style={[
                  approved ? styles.approveBtn : styles.rejectBtn,
                  busy && styles.btnDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={approved ? '#fff' : colors.danger} size="small" />
                ) : (
                  <Text style={approved ? styles.approveBtnText : styles.rejectBtnText}>
                    {approved ? t('requestApprove') : t('requestReject')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  keyboardWrap: { width: '100%' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { marginTop: 6, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  label: { marginTop: 14, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  inputScroll: { maxHeight: 140, marginTop: 8 },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  inputError: { borderColor: colors.danger },
  errorText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: colors.danger },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontWeight: '800', color: colors.text, fontSize: 14 },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  rejectBtnText: { fontWeight: '800', color: colors.danger, fontSize: 14 },
  approveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  approveBtnText: { fontWeight: '800', color: '#fff', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
});
