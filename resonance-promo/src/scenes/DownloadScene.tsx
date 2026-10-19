import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { PulseRing } from "../components/PulseRing";
import { BODY_FONT, COLORS } from "../theme";
import { BEATS, SHOTS } from "../timeline";

// Centre of the download icon in the top bar of home.png.
const ICON = { x: 1683, y: 50 };

export const DownloadScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lit = spring({
    frame: frame - BEATS.download.ring * fps,
    fps,
    config: { damping: 9, mass: 0.5 },
  });
  const saved = spring({
    frame: frame - BEATS.download.saved * fps,
    fps,
    config: { damping: 9, mass: 0.5 },
  });

  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.download} shadowColor={COLORS.yellow}>
        <PulseRing x={ICON.x} y={ICON.y} radius={18} start={BEATS.download.ring} />
        <div
          style={{
            position: "absolute",
            left: ICON.x - 16,
            top: ICON.y - 16,
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: lit,
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"
              stroke={COLORS.white}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          style={{
            position: "absolute",
            left: ICON.x - 44,
            top: ICON.y + 24,
            width: 88,
            textAlign: "center",
            fontFamily: BODY_FONT,
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.bg,
            backgroundColor: COLORS.mint,
            padding: "3px 0",
            borderRadius: 5,
            scale: saved,
          }}
        >
          Saved offline
        </div>
      </AppWindow>
      <Caption kicker="It gets better" kickerColor={COLORS.yellow}>
        Download. Listen offline.
      </Caption>
    </AbsoluteFill>
  );
};
