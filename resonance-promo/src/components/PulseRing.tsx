import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../theme";

// Rings expanding from a point, in the coordinate space of the parent.
export const PulseRing: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly start: number;
  readonly color?: string;
}> = ({ x, y, radius, start, color = COLORS.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame - start * fps;

  if (elapsed < 0) {
    return null;
  }

  return (
    <>
      {[0, 0.5].map((offset) => {
        const cycle = (elapsed / fps / 1 + offset) % 1;
        const size = radius * 2 * interpolate(cycle, [0, 1], [1, 2.6]);
        return (
          <div
            key={offset}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `${radius * 0.16}px solid ${color}`,
              opacity: interpolate(cycle, [0, 1], [0.9, 0]),
            }}
          />
        );
      })}
    </>
  );
};
