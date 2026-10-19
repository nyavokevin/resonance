# Hyperframes Composition Brief: Resonance

## Objective
Create a ~38-39 second, voiceover-driven, "fake 2016 startup Series A launch" brag video for Resonance, a multi-platform (Spotify/YouTube/Apple Music/SoundCloud) music player with playlists, downloads, genre mixes, friends/presence, and real-time synced group listening ("Jam") with in-Jam chat.

## Output
- Composition directory (primary): `composition/` (vertical)
- Rendered video: `../brag.mp4` → final path `brag-output-2026-10-08-190008/brag.mp4`
- Format: **Vertical — 1080×1920** (primary deliverable this pass). A landscape 1920×1080 pass follows as a second composition reusing this same script/audio.
- Duration: ~38-39 seconds (user-specified 30-45s range; see brag-plan.md for why this exceeds the usual 15-25s default)

## Source Material
- Project root: `K:\personal\resonance`
- Primary files read: `README.md`, `package.json`, `app/globals.css`, `app/layout.tsx`, `components/UrlInput.tsx`, `components/Sidebar.tsx`, `components/DiscoverView.tsx`, `components/FriendsView.tsx`, `components/PlayerBar.tsx`, `components/JamController.tsx`, `components/ChatView.tsx`, `components/TopBar.tsx`
- Product name: **Resonance**
- Tagline / strongest claim: "accepte n'importe quel lien ... et le joue dans une interface unifiée" (any link, one unified player) — rendered in English for this cut as "Listen free. Like Spotify."
- Key UI/visual moments to recreate (in order): URL paste bar with auto-detect badge → Sidebar playlist creation ("Radical Optimism (Extended Versions)") → Download/save action (TopBar icon) → Discover genre-mix tiles → Friends presence row → Jam code + participants + shared queue + "Go Live" → in-Jam chat over the still-playing player bar.
- Copy that must appear verbatim:
  - "What if you could listen to YouTube... like Spotify... for free?" (hook VO)
  - "Music was never meant to be listened to alone." (closing VO)
  - "Resonance. Listen together. For free." (end card)
  - "Radical Optimism (Extended Versions)" (example playlist name)

## Creative Direction
- Tone preset: `yc-parody` blended with `chaotic`-pace cuts (see brag-plan.md "Tone" section for the full reconciliation)
- Creative direction: "fake Series A launch from 2016" — breathless, completely-straight founder narration ("We're thrilled to announce...", "disrupting how the world listens") over fast 2-4s cuts with hand-clap-style transition hits
- Interpretation: Keep every UI recreation in the app's real dark theme (#1e1f22 base / #5865f2 accent) for product accuracy. Layer flat-pastel accent shapes (lavender/mint/peach/pink) and big bold Plus Jakarta Sans captions on TOP of/around those UI moments for the 2016-launch-video framing — that pastel-on-dark collision is the joke, not a redesign of the product itself.
- Angle: see brag-plan.md "The angle"
- Hook: "Listen free. Like Spotify." (caption) / full line spoken in VO
- Outro / punchline: "Music was never meant to be listened to alone." → end card "Resonance. Listen together. For free."
- Avoid:
  - Generic SaaS language ("streamline your workflow", etc.)
  - Abstract filler visuals — every scene must show a real, named UI moment
  - Redesigning the product's actual UI chrome — pastel treatment is additive framing only, not a palette swap of the app itself
  - Presenting the "Download" action as a literally-shipped offline-caching feature without the caveat noted in brag-plan.md (it's today's `Download`/import icon repurposed for this cut — flag, don't hide)

## Visual Identity
- Background: `#1e1f22`
- Panel: `#2b2d31`
- Card: `#313338`
- Edge: `#3f4147`
- Text: `#ffffff` / soft `#b5bac1` / muted `#80848e`
- Accent: `#5865f2` (hover `#4752c4`) — matches the user's requested "#5B5BF7-ish" indigo/violet
- Presence/ok green: `#23a55a`
- Flat-pastel framing accents (graphic layer only): lavender `#C9C6FF`, mint `#BFEFE0`, peach `#FFD9B8`, pink `#FFC9DE`
- Display font: Plus Jakarta Sans (700) for captions/headlines
- Body font: Inter for UI mockup text
- Visual references: `public/logo.png` (logo mark), the always-visible 90px player bar, the Jam "Go Live" pulse button

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract (10 scenes, ~38-39s total). Scene summary:
1. Hook — 3.0s — caption "Listen free. Like Spotify." + pastel accents
2. Announce — 2.5s — logo + "We're thrilled to announce. Resonance."
3. Paste any link — 3.5s — UrlInput recreation, platform badge cycling, resolve
4. Playlists — 3.5s — Sidebar create flow, "Radical Optimism (Extended Versions)" row
5. Download — 3.5s — TopBar Download icon tap + toast
6. Discover — 3.5s — 4 genre-mix tiles pop in (beat-locked to 16.02/17.02/17.52/18.02/18.52s)
7. Friends — 3.5s — 2 friend presence rows (beat-locked to 20.02/21.01/22.01/23.02s)
8. Jam — 4.0s — code reveal, participants arriving, shared queue, "Go Live" pulse
9. Chat — 3.5s — ChatView bubbles over the still-playing player bar
10. Closing + end card — 5.0s — founder line → logo lockup + tagline + placeholder CTA

## Audio
- Audio role: upbeat founder-energy music bed (lower than usual) + full English voiceover carrying the story
- Audio arc: music fades in under the hook, holds low/ducked under every VO line, swells slightly (uncapped back to bed volume) in the gaps between lines, beat-locks two mid-video scenes to the track's documented strong cues, fades out under the end card
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM), trimmed to ~38-39s
- Music treatment: bed volume ~0.22-0.28 normally, ducked to ~0.12-0.15 under VO lines, fade-out over the final ~1.5s
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json` / `.md`. Documented strong cues in the 0-25s window: 16.02, 17.02, 17.52, 18.02, 18.52, 20.02, 21.01, 22.01, 23.02, 23.52 (all seconds). These land inside Scene 6 (Discover, 16.0-19.5s) and Scene 7 (Friends, 19.5-23.0s) — lock those reveals to them. Beyond 25s the track holds a steady ~0.4992s beat grid at the same tempo; run `npx hyperframes beats` on the composition if finer precision is wanted for Scenes 8-10.
- Audio-reactive treatment: subtle — let the player-bar glow / accent elements breathe gently with RMS/bass. No waveform or equalizer graphics beyond the product's own existing 3-bar queue equalizer where it's already diegetic UI.
- Audio-coupled moments:
  - Scene 3 (paste link) — randomized keyboard keypress ticks while the URL types
  - Scene 4 (playlist row) / Scene 8 (Jam participants) / Scene 7 (friend rows) — card/drop sound per sequential item, beat-locked where noted
  - Every hard-cut transition (Scenes 1→2 through 8→9) — a crisp double-hit stand-in for "hand-clap" (no literal clap sample in the CC0 library; flagged substitution)
  - Scene 2 (announce reveal) and Scene 10 (final logo) — one soft bell/announcement hit each
- SFX selection guidance: pick exact filenames per the current `sfx-analysis.md` guidance — prefer low/medium HF-risk picks since this is a repeated-cut, fairly dense edit (10 scenes in ~38s)
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` / `.json`
- Exact SFX choice: Hyperframes chooses exact filenames, timestamps, density, and volume once the animation is implemented
- Audio files: copy chosen music + SFX into `composition/assets/`

## Voiceover
Voice is explicitly requested by the user for this run ("Write the voiceover script in English"). Full 11-line script is in `brag-plan.md` → "Voiceover script". Generate via:
```
npx hyperframes tts "<line>" --voice af_heart --output assets/voiceover-XX.wav
```
per-line (or as one script with scene markers, whichever the current Hyperframes TTS workflow prefers), duck music to ~0.12-0.15 under each line per the current Data Attributes + Audio contract, and adjust each scene's `data-duration` to match the actual rendered line length rather than the planning estimate above. If total VO + holds overruns 45s, tighten the script (not the window) — see brag-plan.md duration note.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. This is `/brag`'s own workflow; do not enter the generic `hyperframes` promo/launch-video intent interview.

Requirements:
- Show at least one real UI/copy/visual element per scene (all 10 scenes reference a specific real component — see Storyboard above).
- Keep all text readable (≤6-word captions get a full settled hold; VO lines size their scenes).
- Keep total duration inside the user's 30-45s window (~38-39s target).
- Build the voiceover track and duck music under it per the Voiceover section.
- Beat-lock Scene 6 and Scene 7 reveals to the documented strong cues (±0.15s), marked `// beat-locked`.
- Use the hand-clap-double-hit stand-in on every hard-cut transition; call out in your own build notes that it's a substitution for a literal clap sample.
- Keep pastel framing graphics additive/overlay only — never recolor the actual recreated app chrome away from its real dark/indigo palette.
- Run `npx hyperframes check` before render (brag's single gate) — fix every error including WCAG contrast.
- Keep creation and rendering local.

After this vertical composition passes `check` and renders, a second landscape (1920×1080) composition will reuse this same brief/plan/audio with an adapted layout.
