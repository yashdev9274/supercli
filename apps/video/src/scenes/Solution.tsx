import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Audio, staticFile} from 'remotion';
import {TypingTextWithSound} from '../components/TypingTextWithSound';
import {COLORS, FONTS} from '../lib/constants';

export const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  
  // All animations start immediately - no empty frames
  const text1Opacity = interpolate(frame, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const text2Opacity = interpolate(frame, [35, 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const promptOpacity = interpolate(frame, [70, 85], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const promptScale = interpolate(frame, [70, 85], [0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Use impact sound for success moment
  const impactVolume = interpolate(
    frame,
    [80, 85, 90, 120],
    [0, 0.5, 0.5, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
      }}
    >
      {/* Success sound using impact - MUTED */}
      <Audio 
        src={staticFile("audio/impact.mp3")} 
        volume={0}
        playbackRate={1.5}
      />
      
      {/* First line - starts at frame 0 */}
      <div
        style={{
          opacity: text1Opacity,
          fontFamily: FONTS.mono,
          fontSize: '48px',
          color: COLORS.text,
          fontWeight: 500,
        }}
      >
        <TypingTextWithSound
          text="Your entire workflow"
          startFrame={0}
          speed={3}
          showCursor={false}
        />
      </div>

      {/* Second line */}
      <div
        style={{
          opacity: text2Opacity,
          fontFamily: FONTS.mono,
          fontSize: '48px',
          color: COLORS.text,
          fontWeight: 500,
        }}
      >
        <TypingTextWithSound
          text="from one place"
          startFrame={30}
          speed={3}
          showCursor={false}
        />
      </div>

      {/* Terminal prompt */}
      <div
        style={{
          opacity: promptOpacity,
          transform: `scale(${promptScale})`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '40px',
          padding: '16px 24px',
          backgroundColor: COLORS.backgroundLight,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
        }}
      >
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: '32px',
            color: COLORS.primary,
            fontWeight: 'bold',
          }}
        >
          $
        </span>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: '32px',
            color: COLORS.text,
            fontWeight: 500,
          }}
        >
          <TypingTextWithSound
            text="supercode"
            startFrame={60}
            speed={4}
            showCursor={frame < 130}
          />
        </div>
      </div>

      {/* Platform badges */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginTop: '60px',
        }}
      >
        {['terminal', 'ide', 'slack', 'web'].map((tool, index) => (
          <div
            key={tool}
            style={{
              padding: '4px 12px',
              backgroundColor: COLORS.backgroundLight,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '4px',
              fontFamily: FONTS.mono,
              fontSize: '11px',
              color: COLORS.textMuted,
              opacity: interpolate(
                frame,
                [100 + index * 6, 115 + index * 6],
                [0, 1],
                {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
              ),
              transform: `translateY(${interpolate(
                frame,
                [100 + index * 6, 115 + index * 6],
                [10, 0],
                {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
              )}px)`,
            }}
          >
            {tool}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};