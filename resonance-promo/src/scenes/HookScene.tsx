import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PopWords } from "../components/PopWords";
import { BODY_FONT, COLORS, HEADLINE_FONT, useLayout } from "../theme";
import { BEATS } from "../timeline";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, headlineSize } = useLayout();
  const punch = spring({
    frame: frame - BEATS.hook.punchline * fps,
    fps,
    config: { damping: 8, mass: 0.7 },
  });
  const kicker = spring({ frame, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: vertical ? "0 90px" : "0 220px",
        gap: 44,
      }}
    >
      <div
        style={{
          fontFamily: BODY_FONT,
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: COLORS.bg,
          backgroundColor: COLORS.mint,
          padding: "10px 26px",
          borderRadius: 999,
          rotate: "-3deg",
          scale: kicker,
        }}
      >
        A message from our founder
      </div>
      <PopWords
        text="What if you could listen to YouTube like Spotify..."
        start={BEATS.hook.firstWord}
        gap={BEATS.hook.wordGap}
        style={{
          fontFamily: HEADLINE_FONT,
          fontSize: headlineSize,
          fontWeight: 800,
          lineHeight: 1.1,
          color: COLORS.white,
          justifyContent: "center",
          textAlign: "center",
        }}
      />
      <div
        style={{
          fontFamily: HEADLINE_FONT,
          fontSize: headlineSize * 1.35,
          fontWeight: 800,
          lineHeight: 1,
          color: COLORS.bg,
          backgroundColor: COLORS.yellow,
          padding: "18px 44px",
          borderRadius: 28,
          rotate: "-4deg",
          scale: punch,
        }}
      >
        for free?
      </div>
    </AbsoluteFill>
  );
};
