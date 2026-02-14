# Supercode Video - Audio Guide

## Audio Files Added

All audio files are located in `apps/video/public/audio/`:

- **bg-music.mp3** - Background ambient music (plays throughout)
- **typing.mp3** - Mechanical keyboard typing sound (Scene 4)
- **success.mp3** - Success chime (Scene 3 & 4)
- **impact.mp3** - Cinematic impact/whoosh (Scene 5)
- **whoosh.mp3** - Transition whoosh (Scene 1)
- **glitch.mp3** - Glitch/digital error sound (Scene 2)

## Scene-by-Scene Audio Breakdown

### Scene 1: Hook (0-3s)
- **Whoosh sound** - Plays at frame 0-5 when "What if..." appears
- Volume: 30%

### Scene 2: Problem (3-7s)
- **Glitch sounds** - Play at frames 20, 40, 60
- Creates chaotic, overwhelming feel
- Volume: 20%

### Scene 3: Solution (7-12s)
- **Success chime** - Plays at frame 85 when terminal prompt appears
- Signifies "aha moment" / clarity
- Volume: 40%

### Scene 4: Terminal Demo (12-19s)
- **Typing sounds** - Play on every keystroke while command types
- Creates realistic terminal feel
- Volume: 30%
- **Success chime** - Plays after output appears (frames 85-90)
- Volume: 40%

### Scene 5: CTA (19-23s)
- **Impact sound** - Plays at frame 0 (logo reveal)
- Epic cinematic whoosh
- Volume: 50%

### Background Music (All scenes)
- Plays continuously throughout the video
- Volume: 15% (ducked during SFX)
- Fades in at start (0-30 frames)
- Fades out at end (last 30 frames)

## Technical Implementation

### Audio Component Usage

Each scene imports the Audio component from Remotion:
```typescript
import {Audio, staticFile} from 'remotion';

// Play sound conditionally
{frame === 0 && (
  <Audio 
    src={staticFile("audio/whoosh.mp3")} 
    volume={0.3}
    startFrom={0}
    endAt={10}
  />
)}
```

### Background Music with Volume Ducking

In Root.tsx:
```typescript
const musicVolume = interpolate(
  frame,
  [0, 30, DURATIONS.total - 30, DURATIONS.total],
  [0, 0.15, 0.15, 0]
);

<Audio 
  src={staticFile("audio/bg-music.mp3")} 
  volume={musicVolume}
/>
```

## Testing

Preview with audio:
```bash
bun run dev:video
```

Build with audio:
```bash
bun run build:video
```

## Audio Sources

- **Typing**: Orange Free Sounds - Mechanical keyboard typing
- **Success**: Orange Free Sounds - Success chime
- **Impact**: Orange Free Sounds - Cinematic whoosh
- **Whoosh**: Pixabay - Transition whoosh
- **Glitch**: Pixabay - Digital glitch
- **Background Music**: Pixabay - Ambient electronic

All sounds are royalty-free and free to use commercially.