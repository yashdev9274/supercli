import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Root} from './Root';
import {DURATIONS} from './lib/constants';

const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main video - Twitter optimized 1080x1080 */}
      <Composition
        id="Root"
        component={Root}
        durationInFrames={DURATIONS.total}
        fps={30}
        width={1080}
        height={1080}
      />

      {/* Vertical format - Instagram Reels/TikTok */}
      <Composition
        id="Vertical"
        component={Root}
        durationInFrames={DURATIONS.total}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Wide format - YouTube/Landing page */}
      <Composition
        id="Wide"
        component={Root}
        durationInFrames={DURATIONS.total}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);