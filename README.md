# 语序拼图

Standalone sentence-puzzle app. GitHub Pages serves this repository from the site root:

https://hehelelehaha-dot.github.io/nova-puzzle/

Tap word tiles into the right English sentence. Themes are Lash, Dealer, Daily, Scary, and Naval. Progress is stored on this phone under `puzzle_` localStorage keys.

Every clip used by the app is in this repository:

- `audio/lash`, `audio/dealer`, `audio/daily` — Fish voice-over, precached by the service worker
- `audio/scary` — Scary story clips, cached the first time they play
- `audio/naval` — original (`tNNo`) then Kokoro (`tNN`), cached the first time they play

Playback order is sentence audio, then original audio, then the Kokoro clip, then Web Speech.
