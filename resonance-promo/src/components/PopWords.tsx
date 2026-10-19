import type React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// Words that bounce in one after the other. Timings are in seconds.
export const PopWords: React.FC<{
  readonly text: string;
  readonly start: number;
  readonly gap: number;
  readonly style?: React.CSSProperties;
  readonly wordStyle?: React.CSSProperties;
}> = ({ text, start, gap, style, wordStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.26em", ...style }}>
      {text.split(" ").map((word, i) => {
        const pop = spring({
          frame: frame - (start + i * gap) * fps,
          fps,
          config: { damping: 9, mass: 0.6 },
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(pop, [0, 0.4], [0, 1], {
                extrapolateRight: "clamp",
              }),
              scale: pop,
              translate: `0px ${interpolate(pop, [0, 1], [40, 0])}px`,
              ...wordStyle,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
