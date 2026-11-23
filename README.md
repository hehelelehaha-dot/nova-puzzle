# 语序拼图

Standalone sentence-puzzle app. GitHub Pages serves this repository from the site root:

https://hehelelehaha-dot.github.io/nova-puzzle/

Tap word tiles into the right English sentence. Themes are Lash, Dealer, Interview, Daily, Scary, and Naval. Interview (面试) is the Turning Stone blackjack dealer interview: each puzzle is one answer sentence, shown under the interviewer's question, grouped by Part 1–4. Progress is stored on this phone under `puzzle_` localStorage keys.

Every clip used by the app is in this repository:

- `audio/lash`, `audio/dealer`, `audio/daily`, `audio/interview` — Fish (Paula) voice-over; `audio/interview/*-ask.mp3` are the interviewer questions
- `audio/scary` — Scary story clips, cached the first time they play
- `audio/naval` — original (`tNNo`) then Kokoro (`tNN`), cached the first time they play

Playback order is sentence audio, then original audio, then the Kokoro clip, then Web Speech.
