import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const logoSource = require('../../assets/icon.png');

type BrandLogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BrandLogo({ size = 64, style }: BrandLogoProps) {
  const radius = Math.round(size * 0.22);

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }, style]}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel="Moni HR"
        source={logoSource}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
