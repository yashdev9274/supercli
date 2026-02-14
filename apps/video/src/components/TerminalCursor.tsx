import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../lib/constants';

interface TerminalCursorProps {
  blink?: boolean;
  color?: string;
  size?: string;
  style?: React.CSSProperties;
}

export const TerminalCursor: React.FC<TerminalCursorProps> = ({
  blink = true,
  color = COLORS.primary,
  size = '1em',
  style,
}) => {
  const frame = useCurrentFrame();
  
  const opacity = blink
    ? interpolate(frame % 30, [0, 15, 30], [1, 0, 1])
    : 1;

  return (
    <span
      style={{
        fontFamily: FONTS.mono,
        color,
        fontSize: size,
        opacity,
        ...style,
      }}
    >
      ▋
    </span>
  );
};