# Hyperframes Composition Brief: Resonance

## Objective
Create a short launch-style brag video for Resonance.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `/home/daytona/project`
- Primary files read: README.md, app/globals.css, app/layout.tsx, app/(app)/page.tsx, components/UrlInput.tsx, components/Sidebar.tsx, lib/i18n/en.ts, public/logo.png
- Product name: Resonance
- Tagline / strongest claim: Paste any link — it just plays.
- Key UI or visual moment to recreate: 90px player bar (pulsing cover, round accent play, seekbar, shuffle/repeat) + universal search bar with platform auto-detect badge + Jam 6-char code with pulsing Go Live button + 3-bar queue equalizer
- Copy that must appear verbatim:
  - PASTE ANY LINK.
  - IT JUST PLAYS.
  - Spotify · YouTube · Apple Music · SoundCloud · MP3
  - Resonance — one player, every link.

## Creative Direction
- Tone preset: polished
- Creative direction: late-night Discord-dark listening session, quiet premium product film
- Interpretation: slow reveals, generous holds, soft crossfades; light-medium type with letter-spacing; restraint over hype.
- Angle: The streaming wars are over. Paste any link, it plays. No more "what platform are you on?" — plus a Jam code so friends listen in sync.
- Hook: Giant "PASTE ANY LINK." / "IT JUST PLAYS." on #1e1f22 with blurple underline, first 3s.
- Outro / punchline: Resonance logo lockup + "one player, every link." Hold, fade.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: #1e1f22
- Panel: #2b2d31
- Card: #313338
- Text: #ffffff
- Soft: #b5bac1
- Accent: #5865f2
- Display font: Plus Jakarta Sans (fallback: Inter, system-ui — local system fonts, no remote fetch)
- Body font: Inter, system-ui
- Visual references from the project: Discord-dark shell, sidebar, search bar, player bar, queue equalizer, Jam code badge

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3s — PASTE ANY LINK. / IT JUST PLAYS. + platform list
2. Reveal player — 5s — search types Spotify URL, badge pops, track resolves, cursor clicks play, cover pulses + equalizer
3. Jam together — 6s — code KX7Q2M, 2 participants arrive one by one, Go Live pulses and syncs
4. Outro — 6s — Resonance logo lockup, tagline, hold + fade

## Audio
- Audio role: warm bed
- Audio arc: bed fades in under hook, holds steady through reveal + Jam with subtle lift on Go Live, fades out over final 2s; one soft bell on logo.
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3
- Music treatment: start 0.0s, volume 0.32, fade-in 0.8s, fade-out last 2s
- Music cue guidance: bundled preset `.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (109.96 BPM); strong cues at 8.74s / 13.11s / 17.47s mapped into timeline; beat-grid ~2.19/2.73/3.27 for badge sequence; optional ±0.15s locks, readability first. Run `npx hyperframes beats` after wiring music.
- Audio-reactive treatment: subtle; RMS/bass breathes blurple glow + player-bar presence. No waveform visuals (product equalizer is diegetic UI).
- Audio-coupled moments:
  - Scene 2 typing — key ticks + badge drop + play click (simulated interaction)
  - Scene 2/3 card sequences — soft drops on arrival, first/last accent only
  - Scene 3 Go Live — soft bell payoff
  - Scene 4 logo — final soft bell, then silence
- SFX selection guidance: motion-matched, minimal; interface/click for taps, interface/drop for arrivals, impactBell_heavy_000 or interface/bong_001 for Go Live + logo at low volume. See `.agents/skills/brag/assets/sfx/sfx-analysis.md` — prefer low HF-risk for polished repeats.
- SFX analysis guidance: `.agents/skills/brag/assets/sfx/sfx-analysis.md` + `.json` if present
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, volume based on implemented animation.
- Audio files: copy chosen music + SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load hyperframes-core (composition contract + data-* timing), hyperframes-animation (motion), hyperframes-creative (design, beats, audio-reactive), hyperframes-keyframes (seek-safe), hyperframes-cli (lint/check/render). /brag is its own workflow: do not enter hyperframes entry-point interview or generic promo workflow. Prefer native Hyperframes conventions.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in final render.
- Keep video within 15-25 seconds (target 20s).
- Include planned music/SFX layer.
- Treat /brag audio notes as guidance, not fixed cue sheet. Choose SFX after visual animation exists.
- Treat cue metadata as optional hints. Ignore cues that hurt readability/pacing/story.
- Major reveals may move toward strong cues ±0.15s. Small entrances align to beats ±0.10s. 1-3 strong locks per video.
- Use SFX to support motion/interaction; restraint when busy.
- Honor fade-outs and final ring using best supported implementation.
- When music present, consider audio-reactive: extract audio data, wire glow/presence subtly. Avoid waveforms, notes, strobing.
- Use local assets for audio and runtime/media deps when possible.
- Run `hyperframes check` before render — brag's single gate.
- Keep creation and rendering local.
