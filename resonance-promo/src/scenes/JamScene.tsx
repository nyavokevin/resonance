import { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { PulseRing } from "../components/PulseRing";
import { COLORS, HEADLINE_FONT, PASTELS, useLayout, type Layout } from "../theme";
import { BEATS, SHOTS } from "../timeline";

const GRID = 92;

// Listener counts: avatar i shows up with the first wave bigger than i.
const WAVES = [
  { count: 1, at: BEATS.jam.one, label: "1 listener", size: 104 },
  { count: 5, at: BEATS.jam.five, label: "5 listeners", size: 104 },
  { count: 50, at: BEATS.jam.fifty, label: "50 listeners", size: 84 },
  { count: Infinity, at: BEATS.jam.infinite, label: "∞ listeners", size: 68 },
];

type Spot = { x: number; y: number; distance: number };

const inside = (
  x: number,
  y: number,
  box: { left: number; top: number; width: number; height: number },
  margin: number,
) =>
  x > box.left - margin &&
  x < box.left + box.width + margin &&
  y > box.top - margin &&
  y < box.top + box.height + margin;

// Jittered grid over the whole frame, minus the window and the caption,
// ordered so the crowd grows outwards from the window.
const crowdSpots = (width: number, height: number, layout: Layout): Spot[] => {
  const captionText = layout.vertical
    ? { ...layout.caption, height: 400 }
    : { ...layout.caption, top: 290, height: 500 };
  const centerX = layout.window.left + layout.window.width / 2;
  const centerY = layout.window.top + layout.window.height / 2;
  const spots: Spot[] = [];

  for (let row = 0; row * GRID < height; row++) {
    for (let col = 0; col * GRID < width; col++) {
      const seed = `${row}-${col}`;
      const x = col * GRID + 30 + (random(`x${seed}`) - 0.5) * 30;
      const y = row * GRID + 30 + (random(`y${seed}`) - 0.5) * 30;
      if (inside(x, y, layout.window, 20) || inside(x, y, captionText, 40)) {
        continue;
      }
      const distance = Math.max(
        Math.abs(x - centerX) / layout.window.width,
        Math.abs(y - centerY) / layout.window.height,
      );
      spots.push({ x, y, distance: distance + random(`d${seed}`) * 0.08 });
    }
  }

  return spots.sort((a, b) => a.distance - b.distance);
};

const Avatar: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx={50} cy={50} r={46} fill={color} stroke={COLORS.bg} strokeWidth={6} />
    <circle cx={36} cy={44} r={6} fill={COLORS.bg} />
    <circle cx={64} cy={44} r={6} fill={COLORS.bg} />
    <path
      d="M34 62 Q50 78 66 62"
      fill="none"
      stroke={COLORS.bg}
      strokeWidth={6}
      strokeLinecap="round"
    />
  </svg>
);

const Crowd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const layout = useLayout();
  const spots = useMemo(() => crowdSpots(width, height, layout), [width, height, layout]);

  return (
    <>
      {spots.map((spot, i) => {
        const waveIndex = WAVES.findIndex((w) => i < w.count);
        const wave = WAVES[waveIndex];
        const waveStart = waveIndex === 0 ? 0 : WAVES[waveIndex - 1].count;
        const waveSize = Math.min(wave.count, spots.length) - waveStart;
        const delay = ((i - waveStart) / waveSize) * 0.6;
        const pop = spring({
          frame: frame - (wave.at + delay) * fps,
          fps,
          config: { damping: 9, mass: 0.5 },
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: spot.x - wave.size / 2,
              top: spot.y - wave.size / 2,
              scale: pop,
              translate: `0px ${Math.sin(frame / 5 + i) * 7}px`,
            }}
          >
            <Avatar color={PASTELS[i % PASTELS.length]} size={wave.size} />
          </div>
        );
      })}
    </>
  );
};

const Counter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { window } = useLayout();
  const wave = [...WAVES].reverse().find((w) => frame >= w.at * fps);

  if (!wave) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: window.left,
        top: window.top - 60,
        width: window.width,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: HEADLINE_FONT,
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1,
          color: COLORS.bg,
          backgroundColor: COLORS.yellow,
          padding: "20px 44px",
          borderRadius: 999,
          border: `8px solid ${COLORS.bg}`,
          rotate: "-3deg",
          scale: spring({
            frame: frame - wave.at * fps,
            fps,
            config: { damping: 8, mass: 0.6 },
          }),
        }}
      >
        {wave.label}
      </div>
    </div>
  );
};

export const JamScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const label = spring({
    frame: frame - BEATS.jam.label * fps,
    fps,
    config: { damping: 10, mass: 0.5 },
  });

  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.jam} shadowColor={COLORS.yellow}>
        {/* "JAM FVRXKA" label in the player bar of home.png */}
        <PulseRing x={303} y={1005} radius={7} start={BEATS.jam.label} />
        <div
          style={{
            position: "absolute",
            left: 293,
            top: 995,
            width: 164,
            height: 21,
            boxSizing: "border-box",
            borderRadius: 6,
            border: `1.5px solid ${COLORS.accent}`,
            backgroundColor: "rgba(91, 91, 247, 0.18)",
            opacity: label,
          }}
        />
      </AppWindow>
      <Crowd />
      <Counter />
      <Caption kicker="The big one" kickerColor={COLORS.mint}>
        Launch a Jam. Unlimited listeners.
      </Caption>
    </AbsoluteFill>
  );
};
