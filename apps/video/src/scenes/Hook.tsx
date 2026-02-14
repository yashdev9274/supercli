import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Audio, staticFile} from 'remotion';
import {TypingTextWithSound} from '../components/TypingTextWithSound';
import {TerminalCursor} from '../components/TerminalCursor';
import {COLORS, FONTS, DURATIONS} from '../lib/constants';

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Scale up slightly for impact
  const scale = interpolate(frame, [0, 20], [0.95, 1], {
    extrapolateRight: 'clamp',
  });

  // Whoosh volume - plays only at start
  const whooshVolume = interpolate(
    frame,
    [0, 5, 10],
    [0.5, 0.5, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Whoosh sound at start - MUTED */}
      <Audio 
        src={staticFile("audio/whoosh.mp3")} 
        volume={0}
        startFrom={0}
      />
      
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          fontFamily: FONTS.mono,
          fontSize: '56px',
          color: COLORS.text,
          textAlign: 'center',
          fontWeight: 300,
        }}
      >
        <TypingTextWithSound
          text="What if..."
          startFrame={20}
          speed={4}
          showCursor={frame < 80}
        />
        {frame >= 80 && frame < DURATIONS.hook && (
          <TerminalCursor />
        )}
      </div>
    </AbsoluteFill>
  );
};