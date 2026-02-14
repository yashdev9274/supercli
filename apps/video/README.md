# Supercode Product Video

A 24-second animated typography video explaining what Supercode is.

## Structure

The video is composed of 4 scenes:

1. **Hook** (0-2s): "What if..." with blinking cursor
2. **Problem** (2-6s): "you could control everything..." with chaotic code visualization
3. **Solution** (6-14s): "Your entire workflow from one place" showing terminal integration
4. **CTA** (14-24s): Logo reveal + "supercli.com"

## Quick Start

```bash
# Start the Remotion studio for preview
bun run dev:video

# Or from this directory
bun run dev
```

## Build

```bash
# Build square format (1080x1080) - Twitter/X optimized
bun run build:video

# Build square format explicitly
bun run build:video:square

# Build vertical format (1080x1920) - Instagram Reels/TikTok
bun run build:video:vertical
```

## Technical Details

- **Framework**: Remotion 4.0
- **FPS**: 30
- **Duration**: 720 frames (24 seconds)
- **Formats**: Square, Vertical, Wide
- **Colors**: Matches Supercode dark theme (orange primary)

## File Structure

```
src/
  components/
    TypingText.tsx      # Reusable typing animation
    TerminalCursor.tsx  # Blinking terminal cursor
  scenes/
    Hook.tsx            # Scene 1
    Problem.tsx         # Scene 2
    Solution.tsx        # Scene 3
    CTA.tsx             # Scene 4
  lib/
    constants.ts        # Brand colors, fonts, durations
  Root.tsx              # Main composition
  index.tsx             # Remotion entry point
```

## Customization

Edit `src/lib/constants.ts` to change:
- Colors
- Timing
- Fonts

Edit scene files to change messaging or animations.