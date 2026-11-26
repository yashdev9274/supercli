# JARVIS

A macOS dynamic notch widget focused on calendar and productivity.

## Features

- **Calendar Widget** — Monthly calendar view with today highlighted, event list, all-day events
- **Navigation Tabs** — Home, Calendar, Stats, Notes with smooth selection animation
- **Dynamic Notch** — Expands/collapses with native SwiftUI animations
- **System Integration** — Calendar.app event sync, keyboard shortcuts, menu bar icon

## Building

```bash
# Requires Xcode 15+ and macOS 14+
xcodebuild -scheme Jarvis -configuration Debug build
```

## Credits

JARVIS is built on top of [Atoll](https://github.com/Ebullioscopic/Atoll), which itself derives from [boring.notch](https://github.com/boring-plugins/notch). Licensed under GPL-3.0.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.
