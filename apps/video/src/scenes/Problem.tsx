import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Audio, staticFile} from 'remotion';
import {TypingTextWithSound} from '../components/TypingTextWithSound';
import {COLORS, FONTS} from '../lib/constants';

const codeLines = [
  'const chaos = true;',
  '  await chaos.init();',
  '  // TODO: fix later',
  '  if (broken) {',
  '    return "mess";',
  '  }',
];

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Main text - starts immediately
  const mainOpacity = interpolate(frame, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Terminal appears while text is still typing
  const terminalOpacity = interpolate(frame, [20, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const terminalY = interpolate(frame, [20, 40], [30, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Glitch sound volume - plays at specific moments
  const glitchVolume = interpolate(
    frame,
    [15, 20, 25, 40, 45, 50, 60, 65, 70],
    [0, 0.4, 0, 0.4, 0, 0, 0.4, 0, 0],
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
        gap: '40px',
      }}
    >
      {/* Glitch sounds - MUTED */}
      <Audio 
        src={staticFile("audio/glitch.mp3")} 
        volume={0}
      />
      
      {/* Main text - starts immediately */}
      <div
        style={{
          opacity: mainOpacity,
          fontFamily: FONTS.mono,
          fontSize: '44px',
          color: COLORS.text,
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        <div style={{marginBottom: '12px'}}>
          <TypingTextWithSound
            text="you could control"
            startFrame={0}
            speed={3}
            showCursor={false}
          />
        </div>
        <div>
          <TypingTextWithSound
            text="everything..."
            startFrame={25}
            speed={3}
            showCursor={frame < 80}
          />
        </div>
      </div>

      {/* Terminal window - appears sooner */}
      <div
        style={{
          opacity: terminalOpacity,
          transform: `translateY(${terminalY}px)`,
          width: '480px',
          backgroundColor: COLORS.backgroundLight,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          padding: '16px 20px',
          fontFamily: FONTS.mono,
          fontSize: '14px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Window header */}
        <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
          <div style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444'}} />
          <div style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b'}} />
          <div style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e'}} />
        </div>

        {/* Code lines - start while text is still typing */}
        <div style={{color: COLORS.textMuted}}>
          {codeLines.map((line, index) => (
            <div key={index} style={{marginBottom: '3px'}}>
              <span style={{color: COLORS.textDim, marginRight: '10px', userSelect: 'none'}}>
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <TypingTextWithSound
                text={line}
                startFrame={40 + index * 10}
                speed={1.5}
                showCursor={false}
              />
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};