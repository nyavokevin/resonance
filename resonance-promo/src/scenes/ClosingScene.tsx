import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PopWords } from "../components/PopWords";
import { BODY_FONT, COLORS, HEADLINE_FONT, useLayout } from "../theme";
import { BEATS } from "../timeline";

const LOGO_SIZE = 260;

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, headlineSize } = useLayout();
  const logoAt = BEATS.closing.logo * fps;

  const quoteOut = interpolate(frame, [logoAt - 8, logoAt], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pop = (delay: number) =>
    spring({
      frame: frame - logoAt - delay * fps,
      fps,
      config: { damping: 9, mass: 0.6 },
    });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: vertical ? "0 90px" : "0 240px",
          gap: 40,
          opacity: quoteOut,
          scale: interpolate(quoteOut, [0, 1], [0.9, 1]),
        }}
      >
        <PopWords
          text="Music was never meant to be listened to alone."
          start={BEATS.closing.firstWord}
          gap={BEATS.closing.wordGap}
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
            fontFamily: BODY_FONT,
            fontSize: 40,
            fontWeight: 600,
            color: COLORS.lilac,
            opacity: interpolate(frame, [1.2 * fps, 1.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          — our founder, probably
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30 }}>
        {/* logo.png is a disc on a black square: crop to the disc. */}
        <div
          style={{
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: `18px 18px 0 ${COLORS.pink}`,
            scale: pop(0),
          }}
        >
          <Img
            src={staticFile("logo.png")}
            style={{ width: LOGO_SIZE, height: LOGO_SIZE, scale: 1.36 }}
          />
        </div>
        <div
          style={{
            fontFamily: HEADLINE_FONT,
            fontSize: headlineSize * 1.3,
            fontWeight: 800,
            lineHeight: 1,
            color: COLORS.white,
            marginTop: 20,
            scale: pop(0.12),
          }}
        >
          Resonance
        </div>
        <div
          style={{
            fontFamily: HEADLINE_FONT,
            fontSize: headlineSize * 0.56,
            fontWeight: 700,
            color: COLORS.yellow,
            scale: pop(0.24),
          }}
        >
          Listen together. For free.
        </div>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.white,
            backgroundColor: COLORS.accent,
            padding: "22px 48px",
            borderRadius: 999,
            marginTop: 30,
            scale: pop(0.4),
          }}
        >
          Download link here
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
