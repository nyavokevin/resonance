# Brag Plan: Resonance

## What is this app?
Resonance is a Discord-dark desktop music player (Electron + Next.js) that takes any link — Spotify, YouTube, Apple Music, SoundCloud, direct MP3 — auto-detects the platform, and just plays it, with playlists, genre mixes, a friends/presence layer, and real-time synced group listening ("Jam") with in-Jam chat.

## The angle
Play it as a 2016 startup launch video, pitched completely straight: "We're thrilled to announce..." founder energy, flat-pastel graphic accents layered over the real dark app UI, hand-clap-style transition hits, ukulele/whistle-adjacent upbeat music bed. The joke is the delivery (breathless disruption talk) landing on top of a real, working feature list — the irony is the tone, not the product. Every claim on screen must be something the app actually does.

## Hook (first 2-3 seconds)
On-screen (condensed, ≤6 words): **"Listen free. Like Spotify."**
Voiceover (verbatim, user-mandated): *"What if you could listen to YouTube... like Spotify... for free?"*
Flat pastel accent shapes (soft lavender / mint blobs) pop in behind giant Plus Jakarta Sans type on the dark base. This is the whole promise before the logo even appears.

## Key moments (the middle)
One feature per beat, in the user's specified order, each grounded in a real screen/flow:
- **Paste any link** — UrlInput bar, `Link2` icon, auto-detect badge flips through real `PLATFORM_COLORS`/`PLATFORM_LABELS` (Spotify / YouTube / Apple Music / SoundCloud).
- **Playlists** — Sidebar "Playlists" section, `+` create action, new row appears named **"Radical Optimism (Extended Versions)"** with cover + track count, exactly like `components/Sidebar.tsx`.
- **Download** — TopBar's real `Download` icon (currently used for playlist import) recreated as a one-tap "save for offline" action with a confirmation toast. *(Caveat carried into delivery notes: offline caching isn't in the README's shipped feature list — flagged for the user, not hidden.)*
- **Discover** — `DiscoverView` genre tile grid + the "Mix by genre" row: one-click `Play` + "{Genre} Mix" tiles (Pop / Rock / Hip-Hop / Jazz), real tile-color system.
- **Friends** — `FriendsView` friend row: avatar, green online dot, presence line ("Now listening: Title — Artist"), matching the real friends/presence feature.
- **Jam** — 6-character session code, participants joining the live list one by one, shared queue, pulsing **"Go Live"** button (`Zap` icon) from `PlayerBar.tsx` — all real Jam mechanics (unlimited participants, shared queue via `jam_add_track`).
- **Chat** — `ChatView` message bubbles inside the Jam panel while the player bar keeps playing underneath — real in-Jam chat while music plays.

## Outro / punchline
Founder-style line (verbatim, user-mandated): *"Music was never meant to be listened to alone."*
End card: Resonance logo (`public/logo.png` mark) + **"Listen together. For free."** + placeholder download link (no real domain exists yet — rendered as a clearly placeholder CTA, not a fabricated URL).

## User flow worth showing
Paste a link → it resolves and plays → save a playlist → download a track → one-click a genre mix → add a friend and see their presence → launch a Jam and watch people join → chat inside the Jam while the music keeps going. This is the full real flow, beat for beat — not a landing page recap.

## Tone
- Preset: `yc-parody`, blended with `chaotic`-style fast cuts (closest two-preset fit for "2016 startup launch + fast cuts + hand-claps")
- Creative direction: "fake Series A launch from 2016" — breathless founder voice, played completely straight, with flat-pastel 2016-launch-video graphic accents layered over the real dark-theme UI
- Interpretation: Deadpan-serious delivery (yc-parody) carries the copy ("We're thrilled to announce...", "disrupting how the world listens"); chaotic-style 2–4s cuts and hard transitions carry the pacing. Visual reconciliation: UI recreations stay in the app's real dark theme (#1e1f22 / #5865f2) for product accuracy; the *framing graphics* (hook, announce, transitions, end card) use flat pastel accent shapes bouncing around bold Plus Jakarta Sans captions — that pastel-on-dark collision is the 2016-startup joke. Captions stay ≤6 words per beat per the user's spec; voiceover carries the fuller sentence.

## Format
- Primary: **Vertical 9:16 — 1080×1920** (TikTok/Reels/Shorts)
- Secondary: **Landscape 16:9 — 1920×1080** (same script/timing/audio, re-laid-out composition)

## Duration: ~38-39 seconds (user-specified 30–45s window; exceeds the standard 15-25s brag default because the user explicitly asked for 7 distinct feature beats plus hook/announce/outro — each beat gets a real, readable moment rather than compressing seven features into the usual 3-highlight pattern)

## Visual identity (from the project)
- Background: `#1e1f22`
- Panel: `#2b2d31`
- Card: `#313338`
- Edge/border: `#3f4147`
- Accent (indigo/violet — matches user's "#5B5BF7-ish" ask): `#5865f2`
- Accent hover: `#4752c4`
- Text: `#ffffff`
- Soft text: `#b5bac1`
- Muted text: `#80848e`
- Ok green (presence dot): `#23a55a`
- Display font: Plus Jakarta Sans (bold/700 — captions, headlines)
- Body font: Inter (UI mockup text, matches real app)
- Flat-pastel framing accents (invented for the 2016-launch graphic layer only, not a product color): lavender `#C9C6FF`, mint `#BFEFE0`, peach `#FFD9B8`, soft pink `#FFC9DE`
- Strongest visual element: the always-visible player bar (pulsing cover, round accent play button, Jam code badge, "Go Live" pulse) and the sidebar playlist row

## Share copy (draft)
We're thrilled to announce Resonance is disrupting how the world listens 🎉 Paste any Spotify/YouTube/Apple Music/SoundCloud link — it just plays, free. Make playlists, download tracks, launch a Jam with friends (no limit!), and chat while the music plays. Music was never meant to be listened to alone.

## Audio direction
- Role: upbeat founder-energy bed with voiceover on top
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — the most energetic/upbeat bundled track, closest to the requested "ukulele/whistle" 2016-startup-ad feel; trimmed to the video's ~38-39s window with a fade-out under the end card
- Music treatment: start at 0.0s, bed volume ~0.22-0.28 (lower than usual to leave room for voiceover), duck further to ~0.12-0.15 under every VO line, back up between lines and on the instrumental end-card tail; fade out over the last ~1.5s
- Music cue guidance: preset `happy-beats-business-moves-vol-1` (120.19 BPM). Strong cues in the documented 0-25s window: 16.02s, 17.02s, 17.52s, 18.02s, 18.52s, 20.02s, 21.01s, 22.01s, 23.02s, 23.52s — these land almost exactly inside the planned Discover (16.0-19.5s) and Friends (19.5-23.0s) beats below, so lock those two scenes' reveals to them. Beyond 25s the track holds the same steady ~0.4992s beat spacing (120.19 BPM) — Hyperframes should confirm with `npx hyperframes beats` if finer precision is needed for the Jam/Chat/Closing beats past 25s.
- Audio-reactive treatment: subtle; let the player-bar glow and accent-colored UI elements breathe slightly with RMS/bass. No waveform/equalizer visuals (the product's own 3-bar queue equalizer is diegetic UI and may still appear where it already exists).
- SFX posture: moderate — present on every scene cut to deliver the "hand-clap transition" request. No literal hand-clap sample is in the bundled CC0 library, so transitions use a crisp double-hit (e.g. `impact/impactSoft_medium_*` or a quick `casino/card-place-*` pair) as the nearest stand-in — call this out to the user as a substitution, not a silent swap.
- Audio-coupled moments: key-tick typing sound on the paste-link beat; card/drop sound on each playlist/sidebar row and each Jam participant arriving; click on every simulated cursor tap (play, download, mix, Go Live); soft bell/announcement hit on the "We're thrilled to announce" reveal and on the final logo lockup.
- Restraint rule: VO must never be masked by music or SFX; duck music hard under every spoken line; SFX sits under VO in volume, never over it.

## Voiceover script
Voice is enabled for this run (user explicitly asked for a voiceover script). Narration is tight, energetic, and matches the ≤6-word captions with the fuller sentence spoken on top. Generate via Kokoro (`af_heart` or closest energetic preset) and adjust scene durations to the rendered WAV length per line.

1. **Hook** — "What if you could listen to YouTube... like Spotify... for free?"
2. **Announce** — "We're thrilled to announce: Resonance. Disrupting how the world listens."
3. **Paste link** — "Paste any link — Spotify, YouTube, Apple Music, SoundCloud. It just plays."
4. **Playlists** — "Build a playlist. Save it. It's right in your sidebar."
5. **Download** — "Download your tracks. Take them anywhere — offline."
6. **Discover** — "One click, and a Pop, Rock, Hip-Hop, or Jazz mix is playing."
7. **Friends** — "Add your friends. See exactly what they're listening to."
8. **Jam** — "Launch a Jam. Anyone can join — no limit — everyone adds songs."
9. **Chat** — "Chat right inside the Jam, while the music keeps going."
10. **Closing** — "Because music was never meant to be listened to alone."
11. **End card** — "Resonance. Listen together. For free."

## Storyboard

### Scene 1 — Hook — 3.0s
On-screen: Dark base (#1e1f22) full-bleed. Flat pastel lavender/mint blobs pop in at the corners. Giant Plus Jakarta Sans caption "Listen free. Like Spotify." slams in and holds.
Must reference: the app's actual multi-platform promise (README: "accepte n'importe quel lien").
Sequential/interaction: caption arrives in two chunks — "Listen free." scales in first, "Like Spotify." follows ~0.4s later.
Audio intent: cold open punch — VO carries the full hook line while music fades in underneath.
Audio-coupled idea: soft announcement hit under the caption's first slam.
Music: vol-1 fade-in, bed low under VO.
Transition mood: hard cut (hand-clap-style double hit) → Scene 2

### Scene 2 — Announce — 2.5s
On-screen: Resonance logo mark pops to center with a flat-pastel confetti-pop accent. Caption: "We're thrilled to announce." then "Resonance." (big, bold, deadpan-serious framing — the yc-parody joke).
Must reference: real product name/mark (`public/logo.png`, Sidebar's accent-badge lockup).
Sequential/interaction: logo scales in, then caption types/snaps in beneath it.
Audio intent: mock-ceremonial — the "big reveal" played totally straight.
Audio-coupled idea: announcement bell/soft impact at logo landing.
Music: bed continues, VO delivers announce line.
Transition mood: hard cut (clap hit) → Scene 3

### Scene 3 — Paste any link — 3.5s
On-screen: Recreated `UrlInput` bar (dark base, rounded, `Link2` icon). Cursor types a Spotify URL; auto-detect badge flips through real platform colors (Spotify green → YouTube red → Apple Music → SoundCloud orange) before settling; resolves to a track row (cover/title/artist). Caption: "Paste any link. It plays."
Must reference: real `UrlInput` component, real `PLATFORM_COLORS`/`PLATFORM_LABELS`.
Sequential/interaction: yes — typing animation, badge cycling, track row slide-in.
Audio intent: playful tech-demo energy.
Audio-coupled idea: keyboard key-ticks while typing; soft drop when the track row resolves.
Music: bed + VO line 3.
Transition mood: hard cut (clap hit) → Scene 4

### Scene 4 — Playlists — 3.5s
On-screen: Sidebar recreation — "Playlists" header, `+` button tapped, new row appears: cover placeholder, name **"Radical Optimism (Extended Versions)"**, track count badge. Caption: "Build playlists. Keep them."
Must reference: real `Sidebar.tsx` create-playlist flow and playlist row layout.
Sequential/interaction: yes — row rises in (`rise-in` keyframe already used by the app), name types out, count badge pops.
Audio intent: satisfying "saved" feeling.
Audio-coupled idea: card-place sound on row arrival.
Music: bed + VO line 4.
Transition mood: hard cut (clap hit) → Scene 5

### Scene 5 — Download — 3.5s
On-screen: TopBar's real `Download` icon tapped on the resolved track; toast confirms ("Saved — play it anytime"). Caption: "Download. Take it anywhere."
Must reference: real `Download` icon from `TopBar.tsx` (recreated as a save/offline action — flagged caveat above).
Sequential/interaction: yes — cursor click on icon, toast slides up from the real Toaster position.
Audio intent: quick confident confirmation.
Audio-coupled idea: click on tap, soft drop on toast arrival.
Music: bed + VO line 5.
Transition mood: hard cut (clap hit) → Scene 6

### Scene 6 — Discover — 3.5s (16.0-19.5s — beat-lock window)
On-screen: `DiscoverView` genre tile grid; four tiles highlight in sequence — Pop, Rock, Hip-Hop, Jazz — each with its real tile color and a `Play` + "{Genre} Mix" label; one tile taps and starts playing. Caption: "One-click genre mixes."
Must reference: real `DiscoverView` "Mix by genre" tiles and tile-color system.
Sequential/interaction: yes — 4 tiles pop in one by one.
Audio intent: lively, rhythmic.
Audio-coupled idea: card-pop sound per tile, timed to the track's strong cues.
Music: strong cues at 16.02s, 17.02s, 17.52s, 18.02s, 18.52s — lock the 4 tile pops to these (`// beat-locked`).
Transition mood: hard cut (clap hit) → Scene 7

### Scene 7 — Friends — 3.5s (19.5-23.0s — beat-lock window)
On-screen: `FriendsView` friend row — avatar, green online dot, presence line "Now listening: [Track] — [Artist]" appears. A second friend row fades in beneath it. Caption: "See what friends are playing."
Must reference: real friends/presence feature (`FriendsView.tsx`, green presence dot, "Écoute en ce moment" pattern translated to English for this English-voiceover cut).
Sequential/interaction: yes — two friend rows arrive one by one.
Audio intent: warm, social.
Audio-coupled idea: soft drop per row, timed to strong cues.
Music: strong cues at 20.02s, 21.01s, 22.01s, 23.02s — lock the two row arrivals to these (`// beat-locked`).
Transition mood: hard cut (clap hit) → Scene 8

### Scene 8 — Jam — 4.0s
On-screen: Jam code reveal (6-character code, large), 3+ participant rows fade in one by one with green presence dots, shared queue fills with added tracks, pulsing **"Go Live"** button (`Zap` icon, exact `PlayerBar.tsx` styling) flashes once. Caption: "Launch a Jam. No limit."
Must reference: real Jam mechanics — session code, live participant list, shared queue (`jam_add_track`), "Go Live" button.
Sequential/interaction: yes — code first, then participants arrive one by one, then queue rows add, then Go Live pulses.
Audio intent: biggest "wow" moment of the middle section — give it the most room.
Audio-coupled idea: card-place accents per participant; soft bell on Go Live pulse.
Music: bed + VO line 8; slight swell under Go Live.
Transition mood: hard cut (clap hit) → Scene 9

### Scene 9 — Chat — 3.5s
On-screen: Jam panel with `ChatView` message bubbles appearing one by one (friend avatars, short real-looking lines) while the player bar keeps visibly playing underneath (pulsing cover, progress moving). Caption: "Chat while the music plays."
Must reference: real `ChatView` bubble layout + the always-visible `PlayerBar` continuing underneath.
Sequential/interaction: yes — 2-3 chat bubbles arrive in sequence.
Audio intent: cozy, social payoff.
Audio-coupled idea: soft message-pop per bubble.
Music: bed + VO line 9.
Transition mood: soft crossfade (slower than the hard clap cuts — signals we're moving to the close) → Scene 10

### Scene 10 — Closing + end card — 5.0s
On-screen: Full-bleed dark base. Founder line types/fades in: "Music was never meant to be listened to alone." Hold, then crossfade to end card: Resonance logo mark, "Listen together. For free.", placeholder CTA styled clearly as a placeholder (e.g. "Download — coming soon").
Must reference: real logo mark; tagline is user-mandated; CTA is explicitly a placeholder, not a fabricated working link.
Sequential/interaction: founder line settles fully before crossfading to the end card lockup (scale 0.97→1.0).
Audio intent: music fades out under the founder line; one final soft bell on the logo lockup; brief silence before cut to black.
Audio-coupled idea: final bell on logo landing only — let the line and the logo each breathe.
Music: fade-out over final ~1.5s.
Transition mood: end (hold ~0.6s on end card, fade to black 0.4s).

**Music mood for this video:** upbeat founder-energy bed (vol-1), ducked under voiceover throughout, fading out at the very end.
**Audio summary:** One energetic bed (vol-1) under an 11-line English voiceover, ducked hard under every spoken line; hand-clap-style double-hit stand-ins on every hard cut; two scenes (Discover, Friends) beat-locked to the track's documented strong cues; one soft bell on the "announce" reveal and one on the final logo.
