import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

interface CursorProps {
  blinking: boolean;
}

export const Cursor: React.FC<CursorProps> = ({blinking}) => {
  const frame = useCurrentFrame();
  
  const opacity = blinking
    ? interpolate(frame % 30, [0, 15, 30], [1, 0, 1])
    : 1;

  return (
    <span
      style={{
        width: '12px',
        height: '28px',
        backgroundColor: '#333',
        marginLeft: '4px',
        display: 'inline-block',
        opacity,
      }}
    />
  );
};