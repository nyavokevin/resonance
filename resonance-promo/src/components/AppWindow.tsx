import type React from "react";
import {
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BODY_FONT, COLORS, useLayout } from "../theme";
import { SCREENS, type Rect, type Shot } from "../timeline";

const TITLE_BAR = 44;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Camera rect for the current frame of a shot.
const useShotRect = (shot: Shot): Rect => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const last = shot.rects.length - 1;
  const progress = interpolate(
    frame,
    [shot.start * fps, shot.end * fps],
    [0, last],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
  const index = Math.min(Math.floor(progress), last - 1);
  const t = progress - index;
  const a = shot.rects[index];
  const b = shot.rects[index + 1];

  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  };
};

// Screenshot in a rounded app window. The camera frames `shot` and never
// shows past the edges of the screenshot. Children are positioned in
// screenshot pixels, so overlays stay glued to the UI while it moves.
export const AppWindow: React.FC<{
  readonly shot: Shot;
  readonly shadowColor?: string;
  readonly children?: React.ReactNode;
}> = ({ shot, shadowColor = COLORS.accent, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { window } = useLayout();
  const screen = SCREENS[shot.screen];
  const rect = useShotRect(shot);

  const viewW = window.width;
  const viewH = window.height - TITLE_BAR;
  const zoom = Math.max(
    Math.min(viewW / rect.w, viewH / rect.h),
    viewW / screen.w,
    viewH / screen.h,
  );
  const tx = clamp(viewW / 2 - (rect.x + rect.w / 2) * zoom, viewW - screen.w * zoom, 0);
  const ty = clamp(viewH / 2 - (rect.y + rect.h / 2) * zoom, viewH - screen.h * zoom, 0);

  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });

  return (
    <div
      style={{
        position: "absolute",
        ...window,
        scale: interpolate(enter, [0, 1], [0.9, 1]),
        translate: `0px ${interpolate(enter, [0, 1], [70, 0])}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 28,
          backgroundColor: shadowColor,
          translate: "20px 20px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: COLORS.appBase,
          boxShadow: "0 40px 90px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            height: TITLE_BAR,
            backgroundColor: COLORS.appPanel,
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 20,
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.pink }} />
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.yellow }} />
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.mint }} />
          <div
            style={{
              marginLeft: 12,
              fontFamily: BODY_FONT,
              fontSize: 17,
              fontWeight: 600,
              color: COLORS.appInkMuted,
            }}
          >
            Resonance
          </div>
        </div>
        <div style={{ position: "relative", height: viewH, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: screen.w,
              height: screen.h,
              transformOrigin: "0 0",
              translate: `${tx}px ${ty}px`,
              scale: zoom,
            }}
          >
            <Img
              src={staticFile(screen.file)}
              style={{ width: screen.w, height: screen.h, display: "block" }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
