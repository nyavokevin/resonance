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

const LINK = "https://youtu.be/dQw4w9WgXcQ";

// Redraws the top bar input over the screenshot (x 244-820, y 33-69) so
// the link can be typed into it.
const UrlInput: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { typeStart, typeEnd, detect } = BEATS.pasteLink;

  const typed = Math.floor(
    interpolate(frame, [typeStart * fps, typeEnd * fps], [0, LINK.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const glow = interpolate(frame, [typeEnd * fps, detect * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const detected = frame >= detect * fps;
  const pop = spring({
    frame: frame - detect * fps,
    fps,
    config: { damping: 8, mass: 0.5 },
  });
  const caretOn = Math.floor(frame / (fps / 4)) % 2 === 0;

  return (
    <div
      style={{
        position: "absolute",
        left: 244,
        top: 33,
        width: 576,
        height: 36,
        boxSizing: "border-box",
        borderRadius: 8,
        border: `1px solid ${COLORS.accent}`,
        backgroundColor: COLORS.appBase,
        display: "flex",
        alignItems: "center",
        paddingLeft: 12,
        paddingRight: 8,
        gap: 9,
        fontFamily: BODY_FONT,
      }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <path
          d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"
          stroke={COLORS.appInkMuted}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: COLORS.white }}>
        {typed === 0 ? (
          <span style={{ color: COLORS.appInkMuted }}>
            Paste a Spotify, YouTube, Apple Music or MP3 link...
          </span>
        ) : (
          LINK.slice(0, typed)
        )}
        <span style={{ color: COLORS.accent, opacity: caretOn && typed > 0 ? 1 : 0 }}>
          |
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          padding: "2px 6px",
          borderRadius: 4,
          color: detected || glow > 0.5 ? COLORS.white : COLORS.appInkSoft,
          backgroundColor: detected ? "#FF0033" : COLORS.appCard,
          border: `1px solid ${detected ? "#FF0033" : glow > 0 ? COLORS.accent : COLORS.appEdge}`,
          boxShadow: detected
            ? "0 0 14px rgba(255, 0, 51, 0.8)"
            : `0 0 ${glow * 14}px rgba(91, 91, 247, ${glow})`,
          scale: detected ? interpolate(pop, [0, 1], [0.6, 1]) : 1,
        }}
      >
        {detected ? "YouTube" : "Auto-detect"}
      </div>
    </div>
  );
};

export const PasteLinkScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.pasteLink} shadowColor={COLORS.pink}>
        <UrlInput />
      </AppWindow>
      <Caption kicker="Introducing" kickerColor={COLORS.pink}>
        Paste any link.
      </Caption>
    </AbsoluteFill>
  );
};
