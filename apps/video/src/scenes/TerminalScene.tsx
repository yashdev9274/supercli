import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig, Audio, staticFile} from 'remotion';
import {Cursor} from '../components/Cursor';
import {COLORS, FONTS} from '../lib/constants';

export const TerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  
  const command = "npx supercode init";
  const typingStartFrame = 30;
  const typingEndFrame = typingStartFrame + (command.length * 3);
  const outputStartFrame = typingEndFrame + 10;
  
  // Spring animation for terminal appearing
  const slideIn = spring({
    frame,
    fps: 30,
    config: {
      damping: 200,
      stiffness: 100,
    },
  });
  
  // Terminal slide up from bottom
  const translateY = interpolate(slideIn, [0, 1], [800, 100]);
  
  // Scale animation
  const scale = interpolate(frame, [0, durationInFrames], [0.9, 1]);
  
  // 3D rotation
  const rotateY = interpolate(frame, [0, durationInFrames], [10, -10]);
  
  // Calculate visible characters for typing
  const visibleChars = Math.floor(
    interpolate(frame, [typingStartFrame, typingEndFrame], [0, command.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  
  const displayedText = command.slice(0, visibleChars);
  const isTyping = frame >= typingStartFrame && frame < typingEndFrame;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        perspective: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Use whoosh sound for terminal appearance - MUTED */}
      {frame < 10 && (
        <Audio 
          src={staticFile("audio/whoosh.mp3")} 
          volume={0}
          startFrom={0}
          endAt={15}
        />
      )}
      
      <div
        style={{
          transform: `translateY(${translateY}px) rotateX(15deg) rotateY(${rotateY}deg) scale(${scale})`,
          width: '900px',
          height: '500px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            height: '36px',
            backgroundColor: '#f6f6f6',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          {/* Traffic lights */}
          <div style={{display: 'flex', gap: '8px'}}>
            <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f57'}} />
            <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#febc2e'}} />
            <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#28c840'}} />
          </div>
          
          {/* Title */}
          <div style={{flex: 1, textAlign: 'center'}}>
            <span style={{color: '#4d4d4d', fontSize: '13px', fontWeight: 500}}>
              Terminal
            </span>
          </div>
          
          {/* Spacer for symmetry */}
          <div style={{width: '52px'}} />
        </div>
        
        {/* Terminal content */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
            padding: '24px',
            fontFamily: FONTS.mono,
            fontSize: '28px',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', color: '#333'}}>
            <span style={{color: '#2ecc71', fontWeight: 600}}>~</span>
            <span style={{margin: '0 8px', color: '#333'}}>$</span>
            <span>{displayedText}</span>
            <Cursor blinking={!isTyping} />
          </div>
          
          {/* Output after typing */}
          {frame > outputStartFrame && (
            <div style={{marginTop: '16px', fontSize: '18px', color: '#666', lineHeight: 1.6}}>
              <div style={{color: '#333'}}>✓ Project initialized</div>
              <div style={{color: '#333'}}>✓ AI agent configured</div>
              <div style={{color: '#333'}}>✓ Ready to code</div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};