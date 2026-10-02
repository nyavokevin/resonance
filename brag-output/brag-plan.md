# Brag Plan: Resonance

## What is this app?
Resonance is a Discord-dark unified music player that takes any link — Spotify, YouTube, Apple Music, SoundCloud, MP3 — and just plays it, with synced multi-user Jam listening, as a Windows desktop app.

## The angle
The streaming wars are over. Paste any link, it plays. No more "what platform are you on?" — plus a Jam code so friends listen in sync. Specific, earnest, late-night.

## Hook (first 2-3 seconds)
Giant type: "PASTE ANY LINK." then "IT JUST PLAYS." — white on #1e1f22 with blurple #5865f2 underline sweep. The hook is the whole promise in 4 words.

## Key moments (the middle)
- Universal search bar with auto-detect badge cycling Spotify → YouTube → SoundCloud → Apple Music → MP3, resolving to real title/artist/cover.
- The always-visible 90px player bar: pulsing cover, round accent play button, seekbar, shuffle/repeat, 3-bar equalizer in queue.
- Jam: 6-character code, live participant list with "Écoute en ce moment", pulsing "Go Live" button that re-syncs you.

## Outro / punchline
Resonance logo + "Resonance — one player, every link." Hold on dark, music fades. Quiet confidence.

## User flow worth showing
Paste link → resolves to track (title/artist/cover/duration) → plays in unified player bar → create/join Jam with 6-char code → Go Live re-syncs guest to host.

## Tone
- Preset: polished
- Creative direction: late-night Discord-dark listening session, quiet premium product film
- Interpretation: slow reveals, generous holds, soft crossfades; typography light-medium with letter-spacing; restraint over hype; let the product feel premium.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #1e1f22
- Panel: #2b2d31
- Card: #313338
- Accent: #5865f2
- Accent hover: #4752c4
- Text: #ffffff
- Soft text: #b5bac1
- Muted: #80848e
- Ok green: #23a55a
- Display font: Plus Jakarta Sans
- Body font: Inter
- Strongest visual element: 90px player bar with pulsing cover + round accent play button + 3-bar animated equalizer; universal search bar with colored platform badges

## Share copy (draft)
Resonance: paste any Spotify / YouTube / SoundCloud link — it just plays. Plus Jam listening in sync. 🎵

## Audio direction
- Role: warm bed
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 — steady and clean, best for polished
- Music treatment: start at 0.0s, volume 0.32, fade-in 0.8s, fade-out last 2s, steady bed under all scenes
- Music cue guidance: preset happy-beats-business-moves-vol-12 (109.96 BPM); strong cues at 8.74s (reveal), 13.11s (Jam), 17.47s (outro) mapped into composition timeline; beat-grid windows ~2.19/2.73/3.27 for platform badge sequence; restraint: cues bias timing ±0.15s max, never harm readability
- Audio-reactive treatment: subtle; use music RMS/bass to make blurple glow and player-bar presence breathe. No waveform/equalizer visuals (except the product's own 3-bar queue equalizer, which is diegetic UI).
- SFX posture: minimal but present; 2-3 very subtle cues, motion-matched, professional restraint
- Audio-coupled moments: search-bar typing with key ticks; platform badge pops with soft drops; player play-button tap with click; Go Live pulse with soft bell
- Restraint rule: audio must never overpower copy; no aggressive hits; SFX at 0.55-0.70 volume; music never above 0.35

## Storyboard

### Scene 1 — Hook — 3s
What's on screen: #1e1f22 full-bleed. Giant Plus Jakarta Sans: "PASTE ANY LINK." holds, then "IT JUST PLAYS." with #5865f2 underline sweep. Small sub: "Spotify · YouTube · Apple Music · SoundCloud · MP3".
Must reference: real product promise from README ("accepte n'importe quel lien").
Sequential/interaction: two lines arrive one by one — line 1 scales in, line 2 fades up 0.7s later.
Audio intent: warm bed establishes, quiet confidence.
Audio-coupled idea: soft drop on each line arrival; no typing (keep hook clean).
Music: vol-12 steady bed, fade-in.
Transition mood: soft crossfade → Scene 2

### Scene 2 — Reveal, the unified player — 5s
What's on screen: Recreated Resonance shell — sidebar, search bar top, 90px player bar bottom. Search bar types "open.spotify.com/…" → auto-detect badge flips to Spotify green → resolves to track row (cover, title, artist, duration). Cursor clicks round accent play → cover pulses, 3-bar equalizer animates in queue panel.
Must reference: real UrlInput flow, PLATFORM_COLORS badges, PlayerBar controls (shuffle/prev/play/next/repeat), QueuePanel equalizer.
Sequential/interaction: yes — (1) text types into search, (2) badge pops, (3) track row slides in, (4) cursor clicks play.
Audio intent: bed continues; playful lift as resolve lands.
Audio-coupled idea: key ticks while typing if Hyperframes uses typing animation; soft drop on track row; click on play tap.
Music: same bed.
Transition mood: soft slide → Scene 3

### Scene 3 — Jam together — 6s
What's on screen: Jam session view — 6-character code "KX7Q2M" large, participant list with green dots + "Écoute en ce moment: Titre — Artiste", shared queue. Host seeks → guest shows "détaché" → pulsing "Go Live" button appears in player bar → cursor clicks it → syncs.
Must reference: real Jam flow (jam:{id} Realtime, presence, Go Live anti-surprise rule, jam_add_track).
Sequential/interaction: yes — code first, then 2 participants fade in one by one, then Go Live pulses.
Audio intent: bed holds steady; human warmth; one soft payoff on Go Live.
Audio-coupled idea: card-place accents on participant rows arriving one by one; soft bell on Go Live.
Music: bed, subtle swell under Go Live moment.
Transition mood: soft crossfade → Scene 4

### Scene 4 — Outro — 6s
What's on screen: Resonance logo (public/logo.png style mark) center, "Resonance" in Jakarta bold, tagline "one player, every link." Small platform dots row. Hold 3s on logo silence feel.
Must reference: real i18n subtitle "Écoute tes flux Spotify, YouTube et SoundCloud fusionnés en un seul endroit."
Sequential/interaction: none — single confident lockup, slow scale 0.97→1.0.
Audio intent: bed fades over last 2s; final soft bell on logo; silence into end card.
Audio-coupled idea: none — let the logo breathe.
Music: fade-out.
Transition mood: end (hold, fade to black 0.4s).

**Music mood for this video:** steady clean corporate-warm (polished)
**Audio summary:** Warm vol-12 bed throughout with fade in/out, key ticks + drops + one click + one soft bell, all restrained under copy.
