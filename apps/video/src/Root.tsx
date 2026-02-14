import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, interpolate, useCurrentFrame} from 'remotion';
import {Hook} from './scenes/Hook';
import {Problem} from './scenes/Problem';
import {Solution} from './scenes/Solution';
import {TerminalScene} from './scenes/TerminalScene';
import {CTA} from './scenes/CTA';
import {DURATIONS} from './lib/constants';

export const Root: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Background music volume with fade in/out
  const musicVolume = interpolate(
    frame,
    [0, 30, DURATIONS.total - 30, DURATIONS.total],
    [0, 0.15, 0.15, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  
  let currentFrame = 0;
  
  return (
    <AbsoluteFill style={{backgroundColor: '#0a0a0a'}}>
      {/* Background Music - plays throughout */}
      <Audio 
        src={staticFile("audio/bg-music.mp3")} 
        volume={musicVolume}
        startFrom={0}
      />
      
      {/* Scene 1: Hook */}
      <Sequence from={currentFrame} durationInFrames={DURATIONS.hook}>
        <Hook />
      </Sequence>
      {currentFrame += DURATIONS.hook}
      
      {/* Scene 2: Problem */}
      <Sequence from={currentFrame} durationInFrames={DURATIONS.problem}>
        <Problem />
      </Sequence>
      {currentFrame += DURATIONS.problem}
      
      {/* Scene 3: Solution */}
      <Sequence from={currentFrame} durationInFrames={DURATIONS.solution}>
        <Solution />
      </Sequence>
      {currentFrame += DURATIONS.solution}
      
      {/* Scene 4: Terminal Demo */}
      <Sequence from={currentFrame} durationInFrames={DURATIONS.terminal}>
        <TerminalScene />
      </Sequence>
      {currentFrame += DURATIONS.terminal}
      
      {/* Scene 5: CTA */}
      <Sequence from={currentFrame} durationInFrames={DURATIONS.cta}>
        <CTA />
      </Sequence>
    </AbsoluteFill>
  );
};