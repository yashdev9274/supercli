import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Audio, staticFile} from 'remotion';
import {TypingTextWithSound} from '../components/TypingTextWithSound';
import {COLORS, FONTS} from '../lib/constants';

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Logo animation
  const logoScale = interpolate(frame, [0, 20], [0.7, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tagline animation
  const taglineOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Coming Soon animation
  const comingSoonOpacity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const comingSoonScale = interpolate(frame, [50, 70], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Impact sound volume - plays at start
  const impactVolume = interpolate(
    frame,
    [0, 5, 20, 25],
    [0.8, 0.8, 0.8, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  // Pulse animation
  const pulseScale = 1 + 0.1 * Math.sin((frame - 80) * 0.1);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      {/* Impact sound at start - MUTED */}
      <Audio 
        src={staticFile("audio/impact.mp3")} 
        volume={0}
      />
      
      {/* Logo with glow */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          fontFamily: FONTS.mono,
          fontSize: '64px',
          fontWeight: 'bold',
          color: COLORS.text,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          textShadow: `0 0 40px ${COLORS.primaryGlow}`,
        }}
      >
        <span>super</span>
        <span style={{color: COLORS.primary}}>code</span>
        <span
          style={{
            color: COLORS.primary,
            transform: `scale(${pulseScale})`,
            display: 'inline-block',
          }}
        >
          &gt;
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          fontFamily: FONTS.mono,
          fontSize: '28px',
          color: COLORS.textMuted,
        }}
      >
        <TypingTextWithSound
          text="Terminal. Simplified."
          startFrame={20}
          speed={3}
          showCursor={frame < 60}
        />
      </div>

      {/* Coming Soon Badge */}
      <div
        style={{
          opacity: comingSoonOpacity,
          transform: `scale(${comingSoonScale})`,
          fontFamily: FONTS.mono,
          fontSize: '18px',
          color: COLORS.background,
          backgroundColor: COLORS.primary,
          marginTop: '30px',
          padding: '12px 32px',
          borderRadius: '8px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          boxShadow: `0 4px 20px ${COLORS.primaryGlow}`,
        }}
      >
        Coming Soon
      </div>

      {/* URL */}
      <div
        style={{
          opacity: interpolate(frame, [80, 100], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          fontFamily: FONTS.mono,
          fontSize: '18px',
          color: COLORS.textMuted,
          marginTop: '16px',
        }}
      >
        supercli.com
      </div>

      {/* Animated grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage: `
            linear-gradient(to right, ${COLORS.primary} 1px, transparent 1px),
            linear-gradient(to bottom, ${COLORS.primary} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
          transform: `translateY(${frame * 0.5}px)`,
        }}
      />
    </AbsoluteFill>
  );
};