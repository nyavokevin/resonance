import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { BODY_FONT, COLORS } from "../theme";
import { BEATS, SHOTS } from "../timeline";

// The queue panel of home.png ends at y 770. The panel is extended and a
// ninth track slides into it.
export const QueueScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({
    frame: frame - BEATS.queue.slideIn * fps,
    fps,
    config: { damping: 11, mass: 0.6 },
  });

  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.queue} shadowColor={COLORS.mint}>
        <div
          style={{
            position: "absolute",
            left: 1590,
            top: 745,
            width: 300,
            height: interpolate(slide, [0, 1], [26, 72]),
            boxSizing: "border-box",
            backgroundColor: COLORS.appPanel,
            border: `1px solid ${COLORS.appEdge}`,
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1601,
            top: 752,
            width: 278,
            height: 48,
            boxSizing: "border-box",
            borderRadius: 8,
            border: `1px solid ${COLORS.accent}`,
            backgroundColor: COLORS.appCard,
            boxShadow: "0 6px 18px rgba(91, 91, 247, 0.45)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 10px",
            fontFamily: BODY_FONT,
            opacity: interpolate(slide, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            translate: `${interpolate(slide, [0, 1], [320, 0])}px 0px`,
          }}
        >
          <div style={{ fontSize: 11, color: COLORS.appInkMuted, width: 12 }}>9</div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: COLORS.pink,
              color: COLORS.bg,
              fontSize: 16,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ♪
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.white }}>
              Houdini - Extended
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.appInkMuted }}>
              Dua Lipa · added by Mia
            </div>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: COLORS.bg,
              backgroundColor: COLORS.mint,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            NEW
          </div>
        </div>
      </AppWindow>
      <Caption kicker="Democratized" kickerColor={COLORS.lilac}>
        Everyone adds songs
      </Caption>
    </AbsoluteFill>
  );
};
