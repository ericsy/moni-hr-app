import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type LayoutChangeEvent,
  type ScrollView,
  type View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Options = {
  /** 输入框滚到可视区时，距键盘顶部的留白 */
  bottomGap?: number;
  /** 聚焦后额外向下滚动的距离（给下方按钮留空） */
  extraScroll?: number;
};

type KeyboardMetrics = {
  height: number;
  screenY: number;
};

function resolveKeyboardMetrics(height: number, screenY?: number): KeyboardMetrics {
  const screenH = Dimensions.get('screen').height;
  const y =
    typeof screenY === 'number' && screenY > 0 ? screenY : Math.max(0, screenH - height);
  return { height, screenY: y };
}

/**
 * 认证表单：measureLayout + 键盘 screenY 双通道滚动，兼容 Android resize / overlay（ColorOS 等 OEM）。
 */
export function useScrollInputAboveKeyboard(options: Options = {}) {
  const { bottomGap = 28, extraScroll = 0 } = options;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const focusedFieldRef = useRef<RefObject<View | null> | null>(null);
  const focusExtraScrollRef = useRef(extraScroll);
  const revealTargetRef = useRef<{ field: RefObject<View | null>; margin: number } | null>(null);
  const keyboardMetricsRef = useRef<KeyboardMetrics | null>(null);
  const keyboardOpenRef = useRef(false);
  const scrollViewportHeightRef = useRef(0);
  const scrollViewportScreenYRef = useRef(0);
  const baselineWindowHeightRef = useRef(Dimensions.get('window').height);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardResized, setKeyboardResized] = useState(false);

  const resolveVisibleBottom = useCallback(
    (metrics: KeyboardMetrics) => {
      const viewportH = scrollViewportHeightRef.current;
      const viewportTop = scrollViewportScreenYRef.current;
      const layoutBottom =
        viewportH > 0 && viewportTop >= 0 ? viewportTop + viewportH - bottomGap : Number.POSITIVE_INFINITY;
      const keyboardBottom = metrics.screenY - bottomGap;
      // OEM（如 ColorOS）可能 resize 与 overlay 并存，取更保守（更小）的可视底边
      return Math.min(layoutBottom, keyboardBottom);
    },
    [bottomGap],
  );

  const resolveViewportHeight = useCallback(
    (metrics: KeyboardMetrics) => {
      const measured = scrollViewportHeightRef.current;
      const viewportTop = scrollViewportScreenYRef.current;
      const keyboardBased =
        viewportTop >= 0 ? Math.max(0, metrics.screenY - viewportTop) : 0;

      if (Platform.OS === 'android' && keyboardOpenRef.current) {
        if (measured > 0 && keyboardBased > 0) {
          return Math.min(measured, keyboardBased);
        }
        if (measured > 0) return measured;
        if (keyboardBased > 0) return keyboardBased;
        return Dimensions.get('window').height;
      }
      if (measured > 0 && keyboardBased > 0) {
        return Math.min(measured, keyboardBased);
      }
      if (measured > 0) return measured;
      return Math.max(0, metrics.screenY - insets.top);
    },
    [insets.top],
  );

  const scrollToY = useCallback((targetY: number, animated = true) => {
    const y = Math.max(0, targetY);
    scrollYRef.current = y;
    scrollRef.current?.scrollTo({ y, animated });
  }, []);

  const scrollFieldIntoView = useCallback(
    (fieldRef: RefObject<View | null>, metrics: KeyboardMetrics, extra = focusExtraScrollRef.current) => {
      const field = fieldRef.current;
      const content = contentRef.current;
      if (!field || metrics.height <= 0) return;

      const viewportH = resolveViewportHeight(metrics);
      if (viewportH <= 0) return;

      const visibleBottom = resolveVisibleBottom(metrics);

      const scrollByWindow = () => {
        field.measureInWindow((_x, winY, _w, h) => {
          if (h <= 0) return;
          const fieldBottom = winY + h;
          if (fieldBottom <= visibleBottom) return;
          const overlap = fieldBottom - visibleBottom + extra;
          scrollToY(scrollYRef.current + overlap);
        });
      };

      if (!content) {
        scrollByWindow();
        return;
      }

      field.measureLayout(
        content,
        (_x, fieldY, _w, fieldH) => {
          if (fieldH <= 0) {
            scrollByWindow();
            return;
          }
          const layoutTarget = fieldY + fieldH - viewportH + bottomGap + extra;
          scrollToY(Math.max(scrollYRef.current, layoutTarget));

          // 二次用 window 坐标校正（ColorOS 布局延迟时常不准）
          requestAnimationFrame(scrollByWindow);
        },
        scrollByWindow,
      );
    },
    [bottomGap, resolveViewportHeight, resolveVisibleBottom, scrollToY],
  );

  const scrollEnsureVisible = useCallback(
    (fieldRef: RefObject<View | null>, marginBelow = 48) => {
      const metrics = keyboardMetricsRef.current;
      const content = contentRef.current;
      const field = fieldRef.current;
      if (!field || !content || !metrics || metrics.height <= 0) return;

      const apply = () => {
        scrollRef.current?.measureInWindow((_sx, scrollWinY, _sw, scrollWinH) => {
          if (scrollWinY >= 0) scrollViewportScreenYRef.current = scrollWinY;
          if (scrollWinH > 0) scrollViewportHeightRef.current = scrollWinH;

          const androidPad = Platform.OS === 'android' ? 40 : 12;
          const marginTotal = marginBelow + bottomGap + androidPad;
          const scrollTop = scrollViewportScreenYRef.current;

          // Android 16 / ColorOS resize：窗口已缩短，用 ScrollView 实测高度
          const keyboardBased = Math.max(100, metrics.screenY - scrollTop - marginTotal);
          const layoutBased =
            scrollWinH > 0 ? Math.max(100, scrollWinH - marginTotal) : keyboardBased;
          const visibleContentHeight =
            Platform.OS === 'android' ? Math.min(keyboardBased, layoutBased) : keyboardBased;

          field.measureLayout(
            content,
            (_x, fieldY, _w, fieldH) => {
              if (fieldH <= 0) return;
              const targetY = fieldY + fieldH - visibleContentHeight;
              scrollToY(Math.max(scrollYRef.current, Math.max(0, targetY)));
            },
            () => {},
          );
        });
      };

      apply();
      requestAnimationFrame(apply);
    },
    [bottomGap, scrollToY],
  );

  const scrollRevealAboveKeyboard = useCallback(
    (fieldRef: RefObject<View | null>, marginBelow = 20) => {
      scrollEnsureVisible(fieldRef, marginBelow);
    },
    [scrollEnsureVisible],
  );

  const runRevealTarget = useCallback(() => {
    const target = revealTargetRef.current;
    if (!target) return;
    const { field, margin } = target;
    scrollEnsureVisible(field, margin);
    scrollEnsureVisible(field, margin + 36);
    scrollEnsureVisible(field, margin + 64);
    requestAnimationFrame(() => {
      scrollEnsureVisible(field, margin + 20);
      scrollEnsureVisible(field, margin + 48);
    });
  }, [scrollEnsureVisible]);

  const setRevealTarget = useCallback(
    (fieldRef: RefObject<View | null>, margin = 48) => {
      revealTargetRef.current = { field: fieldRef, margin };
      focusedFieldRef.current = fieldRef;
      runRevealTarget();
    },
    [runRevealTarget],
  );

  const runScrollForFocused = useCallback(
    (metrics: KeyboardMetrics, extra = focusExtraScrollRef.current) => {
      if (metrics.height <= 0) return;
      keyboardMetricsRef.current = metrics;

      const tick = () => {
        if (revealTargetRef.current) {
          runRevealTarget();
          return;
        }
        const fieldRef = focusedFieldRef.current;
        if (!fieldRef) return;
        scrollFieldIntoView(fieldRef, metrics, extra);
      };
      tick();

      const delays = Platform.OS === 'android' ? [80, 200, 400, 650, 900, 1100] : [60, 180, 360, 600];
      delays.forEach((ms) => setTimeout(tick, ms));
    },
    [runRevealTarget, scrollFieldIntoView],
  );

  const scrollAnchorIntoView = useCallback(
    (anchorRef: RefObject<View | null>, anchorExtra = extraScroll) => {
      focusedFieldRef.current = anchorRef;
      focusExtraScrollRef.current = anchorExtra;
      const cached = keyboardMetricsRef.current;
      const metrics =
        cached ??
        resolveKeyboardMetrics(
          Platform.OS === 'android' ? 320 : 280,
          Dimensions.get('screen').height - (Platform.OS === 'android' ? 320 : 280),
        );
      runScrollForFocused(metrics, anchorExtra);
    },
    [extraScroll, runScrollForFocused],
  );

  const onFieldFocus = useCallback(
    (fieldRef: RefObject<View | null>, focusExtraScroll = extraScroll) => {
      scrollAnchorIntoView(fieldRef, focusExtraScroll);
    },
    [extraScroll, scrollAnchorIntoView],
  );

  const remeasureViewport = useCallback(() => {
    scrollRef.current?.measureInWindow((_x, winY, _w, h) => {
      if (h > 0) {
        scrollViewportHeightRef.current = h;
        scrollViewportScreenYRef.current = winY;
      }
      const metrics = keyboardMetricsRef.current;
      if (metrics && revealTargetRef.current) {
        runRevealTarget();
      } else if (metrics && focusedFieldRef.current) {
        scrollFieldIntoView(focusedFieldRef.current, metrics, focusExtraScrollRef.current);
      }
    });
  }, [runRevealTarget, scrollFieldIntoView]);

  const onScrollViewLayout = useCallback(
    (e: LayoutChangeEvent) => {
      scrollViewportHeightRef.current = e.nativeEvent.layout.height;
      scrollRef.current?.measureInWindow((_x, winY) => {
        scrollViewportScreenYRef.current = winY;
        const metrics = keyboardMetricsRef.current;
        if (metrics && revealTargetRef.current) {
          runRevealTarget();
        } else if (metrics && focusedFieldRef.current) {
          scrollFieldIntoView(focusedFieldRef.current, metrics, focusExtraScrollRef.current);
        }
      });
    },
    [runRevealTarget, scrollFieldIntoView],
  );

  const scrollToEnd = useCallback((animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const metrics = resolveKeyboardMetrics(
        e.endCoordinates.height,
        e.endCoordinates.screenY,
      );
      keyboardOpenRef.current = true;
      setKeyboardHeight(metrics.height);
      keyboardMetricsRef.current = metrics;

      const afterShow = () => {
        const afterH = Dimensions.get('window').height;
        const resized =
          Platform.OS === 'android' && afterH < baselineWindowHeightRef.current - 40;
        setKeyboardResized(resized);
        remeasureViewport();
        runScrollForFocused(metrics);
      };

      requestAnimationFrame(afterShow);
      if (Platform.OS === 'android') {
        [50, 120, 250].forEach((ms) => setTimeout(afterShow, ms));
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardOpenRef.current = false;
      setKeyboardHeight(0);
      setKeyboardResized(false);
      keyboardMetricsRef.current = null;
      revealTargetRef.current = null;
      baselineWindowHeightRef.current = Dimensions.get('window').height;
    });

    const dimSub =
      Platform.OS === 'android'
        ? Dimensions.addEventListener('change', () => {
            if (!keyboardOpenRef.current) return;
            remeasureViewport();
          })
        : null;

    return () => {
      showSub.remove();
      hideSub.remove();
      dimSub?.remove();
    };
  }, [remeasureViewport, runScrollForFocused]);

  const scrollContentPaddingBottom = (() => {
    if (keyboardHeight <= 0) return 24 + insets.bottom;
    if (Platform.OS === 'android') {
      return 20 + insets.bottom;
    }
    return keyboardHeight + insets.bottom + 16;
  })();

  return {
    scrollRef,
    contentRef,
    scrollYRef,
    keyboardHeight,
    keyboardOpen: keyboardHeight > 0,
    onFieldFocus,
    onScrollViewLayout,
    scrollAnchorIntoView,
    scrollEnsureVisible,
    scrollRevealAboveKeyboard,
    setRevealTarget,
    scrollToEnd,
    scrollContentPaddingBottom,
  };
};
