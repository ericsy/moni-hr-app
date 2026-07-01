import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

/** 店班标识：门店轮廓 + 右上角班次时钟 */
export function StoreShiftIcon({ size = 28, color = '#fff' }: Props) {
  const stroke = 1.75;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 10.5 12 6.5 20.5 10.5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={stroke}
      />
      <Path
        d="M5 10.5v8.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={stroke}
      />
      <Rect height={2.5} rx={0.4} stroke={color} strokeWidth={1.3} width={3} x={7} y={12.5} />
      <Rect height={2.5} rx={0.4} stroke={color} strokeWidth={1.3} width={3} x={14} y={12.5} />
      <Path
        d="M10.5 15.5h3v4.5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.3}
      />
      <Circle cx={17.5} cy={8} r={3.2} stroke={color} strokeWidth={1.4} />
      <Path
        d="M17.5 6.5V8l1.1 1"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.2}
      />
    </Svg>
  );
}
