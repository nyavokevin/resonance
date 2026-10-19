// Every timing and camera move of the promo lives here.
// Durations are in seconds; rects are in screenshot pixels.

export const FPS = 30;

export const sec = (seconds: number) => Math.round(seconds * FPS);

export const SCENES = {
  hook: 3,
  pasteLink: 3,
  playlists: 4,
  download: 3,
  discover: 4,
  friends: 3,
  jam: 5,
  queue: 3,
  chat: 3,
  closing: 4,
} as const;

export type SceneName = keyof typeof SCENES;

// Length of each slide/fade between two scenes. Transitions overlap the
// scenes on both sides, so they shorten the video.
export const TRANSITION = 0.4;

const sceneCount = Object.keys(SCENES).length;

export const TOTAL_FRAMES =
  Object.values(SCENES).reduce((sum, s) => sum + sec(s), 0) -
  (sceneCount - 1) * sec(TRANSITION);

export type Rect = { x: number; y: number; w: number; h: number };

export const SCREENS = {
  home: { file: "screens/home.png", w: 1918, h: 1027 },
  discover: { file: "screens/discover.png", w: 1919, h: 1030 },
  search: { file: "screens/search.png", w: 1918, h: 1029 },
  friends: { file: "screens/friends.png", w: 1916, h: 1020 },
  messages: { file: "screens/messages.png", w: 1919, h: 1032 },
  settings: { file: "screens/settings.png", w: 1919, h: 998 },
  playlist: { file: "screens/playlist.png", w: 1917, h: 1020 },
} as const;

export type ScreenName = keyof typeof SCREENS;

// A shot moves the camera through `rects` (the part of the screenshot to
// frame), starting at `start` and arriving at `end` seconds into the scene.
export type Shot = {
  screen: ScreenName;
  rects: Rect[];
  start: number;
  end: number;
};

export const SHOTS = {
  pasteLink: {
    screen: "home",
    rects: [
      { x: 236, y: 15, w: 440, h: 80 },
      { x: 400, y: 15, w: 440, h: 80 },
    ],
    start: 0.5,
    end: 1.9,
  },
  playlists: {
    screen: "playlist",
    rects: [
      { x: 230, y: 90, w: 1290, h: 860 },
      { x: 400, y: 130, w: 530, h: 170 },
    ],
    start: 0.6,
    end: 2.4,
  },
  download: {
    screen: "home",
    rects: [
      { x: 1380, y: 0, w: 520, h: 300 },
      { x: 1560, y: 10, w: 250, h: 90 },
    ],
    start: 0.3,
    end: 1.4,
  },
  discover: {
    screen: "discover",
    rects: [
      { x: 236, y: 240, w: 560, h: 330 },
      { x: 960, y: 240, w: 560, h: 330 },
      { x: 236, y: 625, w: 560, h: 190 },
    ],
    start: 0.3,
    end: 3.4,
  },
  friends: {
    screen: "friends",
    rects: [
      { x: 219, y: 75, w: 900, h: 500 },
      { x: 232, y: 95, w: 600, h: 300 },
    ],
    start: 0.3,
    end: 1.8,
  },
  jam: {
    screen: "home",
    rects: [
      { x: 219, y: 600, w: 900, h: 427 },
      { x: 232, y: 940, w: 330, h: 80 },
    ],
    start: 0.2,
    end: 1.2,
  },
  queue: {
    screen: "home",
    rects: [
      { x: 1560, y: 95, w: 358, h: 700 },
      { x: 1590, y: 455, w: 310, h: 370 },
    ],
    start: 0.2,
    end: 1.3,
  },
  chat: {
    screen: "messages",
    rects: [
      { x: 219, y: 85, w: 900, h: 520 },
      { x: 236, y: 105, w: 600, h: 210 },
    ],
    start: 0.3,
    end: 1.8,
  },
} as const satisfies Record<string, Shot>;

// Beats inside scenes, in seconds from the start of the scene.
export const BEATS = {
  hook: { firstWord: 0.2, wordGap: 0.13, punchline: 1.9 },
  pasteLink: { typeStart: 0.5, typeEnd: 1.7, detect: 2.0 },
  download: { ring: 1.2, saved: 1.9 },
  friends: { highlight: 1.5 },
  // Listener counts and when each one lands.
  jam: { label: 1.0, one: 1.4, five: 2.1, fifty: 2.8, infinite: 3.7 },
  queue: { slideIn: 1.3 },
  chat: { firstBubble: 1.4, secondBubble: 2.0 },
  closing: { firstWord: 0.15, wordGap: 0.1, logo: 2.0 },
} as const;

export const CAPTION = { firstWord: 0.25, wordGap: 0.09 } as const;
