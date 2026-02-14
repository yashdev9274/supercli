import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../lib/constants';

interface TypingTextProps {
  text: string;
  startFrame: number;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
  showCursor?: boolean;
  cursorBlink?: boolean;
}

export const TypingText: React.FC<TypingTextProps> = ({
  text,
  startFrame,
  speed = 2,
  className,
  style,
  showCursor = true,
  cursorBlink = true,
}) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, frame - startFrame);
  
  // Calculate how many characters to show
  const charsToShow = Math.min(text.length, Math.floor(progress / speed));
  const displayText = text.slice(0, charsToShow);
  
  // Cursor blinking animation
  const cursorOpacity = cursorBlink
    ? interpolate(frame % 30, [0, 15, 30], [1, 0, 1])
    : 1;

  return (
    <span className={className} style={{...style, fontFamily: FONTS.mono}}>
      {displayText}
      {showCursor && charsToShow < text.length && (
        <span
          style={{
            opacity: cursorOpacity,
            color: COLORS.primary,
          }}
        >
          ▋
        </span>
      )}
    </span>
  );
};