import type React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY_FONT, COLORS, HEADLINE_FONT, useLayout } from "../theme";
import { CAPTION } from "../timeline";
import { PopWords } from "./PopWords";

// Bold caption with a founder-speak kicker above it. Bottom third on
// vertical, left side on wide.
export const Caption: React.FC<{
  readonly kicker: string;
  readonly kickerColor?: string;
  readonly children: string;
}> = ({ kicker, kickerColor = COLORS.yellow, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, caption, captionSize } = useLayout();
  const kickerPop = spring({ frame: frame - 3, fps, config: { damping: 10 } });

  return (
    <div
      style={{
        position: "absolute",
        ...caption,
        display: "flex",
        flexDirection: "column",
        justifyContent: vertical ? "flex-start" : "center",
        alignItems: vertical ? "center" : "flex-start",
        gap: 28,
      }}
    >
      <div
        style={{
          fontFamily: BODY_FONT,
          fontSize: vertical ? 34 : 28,
          whiteSpace: "nowrap",
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: COLORS.bg,
          backgroundColor: kickerColor,
          padding: "10px 24px",
          borderRadius: 999,
          rotate: "-3deg",
          scale: kickerPop,
        }}
      >
        {kicker}
      </div>
      <PopWords
        text={children}
        start={CAPTION.firstWord}
        gap={CAPTION.wordGap}
        style={{
          fontFamily: HEADLINE_FONT,
          fontSize: captionSize,
          fontWeight: 800,
          lineHeight: 1.08,
          color: COLORS.white,
          justifyContent: vertical ? "center" : "flex-start",
          textAlign: vertical ? "center" : "left",
        }}
      />
    </div>
  );
};
