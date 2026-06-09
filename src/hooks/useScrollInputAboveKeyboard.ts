import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type ScrollView,
  type View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Options = {
  /** 语言栏等 ScrollView 上方占用高度（不含 safe top） */
  topChrome?: number;
  /** 输入框滚到可视区时，距底部的留白 */
  bottomGap?: number;
};

/**
 * 认证表单等：Android 键盘可能 overlay 或 resize，统一将聚焦输入滚到键盘上方。
 */
export function useScrollInputAboveKeyboard(options: Options = {}) {
  const { topChrome = 48, bottomGap = 20 } = options;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const focusedFieldRef = useRef<RefObject<View | null> | null>(null);
  const baselineWindowHeightRef = useRef(Dimensions.get('window').height);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardOverlay, setKeyboardOverlay] = useState(false);
  const keyboardOverlayRef = useRef(false);

  const scrollFieldIntoView = useCallback(
    (fieldRef: RefObject<View | null>, kbHeight: number) => {
      const field = fieldRef.current;
      const content = contentRef.current;
      if (!field || !content || kbHeight <= 0) return;

      const windowH = Dimensions.get('window').height;
      const overlay =
        Platform.OS === 'android' && windowH >= baselineWindowHeightRef.current - 40;
      const keyboardInset = overlay ? kbHeight : 0;
      const viewportH = windowH - insets.top - topChrome - keyboardInset;

      const scrollToY = (targetY: number) => {
        const y = Math.max(0, targetY);
        if (y > scrollYRef.current - 4) {
          scrollRef.current?.scrollTo({ y, animated: true });
        }
      };

      field.measureLayout(
        content,
        (_x, y, _w, h) => {
          scrollToY(y + h + bottomGap - viewportH);
        },
        () => {
          field.measureInWindow((_x, winY, _w, h) => {
            if (h <= 0) return;
            const visibleBottom = windowH - keyboardInset - bottomGap;
            const fieldBottom = winY + h;
            if (fieldBottom <= visibleBottom) return;
            scrollRef.current?.scrollTo({
              y: scrollYRef.current + (fieldBottom - visibleBottom),
              animated: true,
            });
          });
        },
      );
    },
    [bottomGap, insets.top, topChrome],
  );

  const runScrollForFocused = useCallback(
    (kbHeight: number) => {
      const fieldRef = focusedFieldRef.current;
      if (!fieldRef || kbHeight <= 0) return;
      scrollFieldIntoView(fieldRef, kbHeight);
      if (Platform.OS === 'android') {
        setTimeout(() => scrollFieldIntoView(fieldRef, kbHeight), 280);
      }
    },
    [scrollFieldIntoView],
  );

  const onFieldFocus = useCallback(
    (fieldRef: RefObject<View | null>) => {
      focusedFieldRef.current = fieldRef;
      const kbH = keyboardHeight || (Platform.OS === 'android' ? 300 : 280);
      const delay = Platform.OS === 'android' ? 80 : 40;
      setTimeout(() => scrollFieldIntoView(fieldRef, kbH), delay);
      if (Platform.OS === 'android') {
        setTimeout(() => scrollFieldIntoView(fieldRef, kbH), 320);
      }
    },
    [keyboardHeight, scrollFieldIntoView],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const dimSub = Dimensions.addEventListener('change', ({ window }) => {
      if (keyboardHeight <= 0) {
        baselineWindowHeightRef.current = window.height;
      }
    });

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const kbH = e.endCoordinates.height;
      setKeyboardHeight(kbH);
      requestAnimationFrame(() => {
        const afterH = Dimensions.get('window').height;
        const overlay = Platform.OS === 'android' && afterH >= baselineWindowHeightRef.current - 40;
        keyboardOverlayRef.current = overlay;
        setKeyboardOverlay(overlay);
        runScrollForFocused(kbH);
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      keyboardOverlayRef.current = false;
      setKeyboardOverlay(false);
      baselineWindowHeightRef.current = Dimensions.get('window').height;
    });

    return () => {
      dimSub?.remove();
      showSub.remove();
      hideSub.remove();
    };
  }, [runScrollForFocused]);

  const scrollContentPaddingBottom =
    24 + (Platform.OS === 'android' && keyboardOverlay ? keyboardHeight : 0);

  return {
    scrollRef,
    contentRef,
    scrollYRef,
    keyboardHeight,
    keyboardOverlay,
    onFieldFocus,
    scrollContentPaddingBottom,
  };
}
