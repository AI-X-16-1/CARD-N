import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { size, stroke } from '@/shared/theme';

// Tab bar glyphs, drawn to the icon set named in design-tokens.md's Navigation
// table. They're strokes rather than emoji so the navigator can tint them with
// tabBarActiveTintColor/tabBarInactiveTintColor — the 게임 tab in particular
// needs its own active color, which an emoji can't take.
type TabIconProps = {
  color: string;
  // The navigator passes its own size; design-tokens.md fixes tab icons at 21px,
  // so callers that want the spec value simply omit this.
  size?: number;
};

type GlyphProps = TabIconProps & { children: ReactNode };

function Glyph({ color, size: iconSize = size.tabIcon, children }: GlyphProps) {
  return (
    <Svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke.tabIcon}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function HomeIcon(props: TabIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M3.5 10.2a2 2 0 0 1 .72-1.54l6.5-5.42a2 2 0 0 1 2.56 0l6.5 5.42a2 2 0 0 1 .72 1.54V19a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
      <Path d="M9.5 21v-6.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21" />
    </Glyph>
  );
}

export function ListIcon(props: TabIconProps) {
  return (
    <Glyph {...props}>
      <Circle cx="4.2" cy="6" r="1.1" fill={props.color} stroke="none" />
      <Circle cx="4.2" cy="12" r="1.1" fill={props.color} stroke="none" />
      <Circle cx="4.2" cy="18" r="1.1" fill={props.color} stroke="none" />
      <Path d="M9 6h11" />
      <Path d="M9 12h11" />
      <Path d="M9 18h11" />
    </Glyph>
  );
}

export function CameraIcon(props: TabIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M14.6 4.2h-5.2L7 7.2H4.2a2 2 0 0 0-2 2v8.6a2 2 0 0 0 2 2h15.6a2 2 0 0 0 2-2V9.2a2 2 0 0 0-2-2H17z" />
      <Circle cx="12" cy="13.4" r="3.4" />
    </Glyph>
  );
}

export function GraphIcon(props: TabIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M12 6.6v4" />
      <Path d="M10.2 14.4 6.8 17.2" />
      <Path d="M13.8 14.4l3.4 2.8" />
      <Circle cx="12" cy="12.8" r="2.6" />
      <Circle cx="12" cy="4.4" r="2.2" />
      <Circle cx="5" cy="18.8" r="2.2" />
      <Circle cx="19" cy="18.8" r="2.2" />
    </Glyph>
  );
}

export function SwordsIcon(props: TabIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <Path d="M13 19l6-6" />
      <Path d="M16 16l4 4" />
      <Path d="M19 21l2-2" />
      <Path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <Path d="M5 14l4 4" />
      <Path d="M7 17l-3 3" />
      <Path d="M3 19l2 2" />
    </Glyph>
  );
}
