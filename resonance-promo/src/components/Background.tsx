import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../theme";

type Shape = {
  kind: "circle" | "square" | "triangle" | "ring" | "squiggle";
  color: string;
  // Position as a fraction of the frame, size as a fraction of its short side.
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
};

const SHAPES: Shape[] = [
  { kind: "circle", color: COLORS.pink, x: 0.06, y: 0.07, size: 0.2, speed: 0.9, phase: 0 },
  { kind: "triangle", color: COLORS.yellow, x: 0.9, y: 0.1, size: 0.13, speed: 1.2, phase: 1.3 },
  { kind: "ring", color: COLORS.mint, x: 0.95, y: 0.46, size: 0.15, speed: 0.7, phase: 2.1 },
  { kind: "square", color: COLORS.lilac, x: 0.02, y: 0.55, size: 0.1, speed: 1.1, phase: 3.4 },
  { kind: "squiggle", color: COLORS.yellow, x: 0.1, y: 0.93, size: 0.2, speed: 1, phase: 0.7 },
  { kind: "circle", color: COLORS.mint, x: 0.88, y: 0.92, size: 0.17, speed: 0.8, phase: 4.2 },
  { kind: "square", color: COLORS.pink, x: 0.62, y: 0.02, size: 0.06, speed: 1.4, phase: 5 },
];

const ShapeGraphic: React.FC<{ kind: Shape["kind"]; color: string }> = ({
  kind,
  color,
}) => {
  if (kind === "circle") {
    return <circle cx={50} cy={50} r={50} fill={color} />;
  }
  if (kind === "square") {
    return <rect width={100} height={100} rx={18} fill={color} />;
  }
  if (kind === "triangle") {
    return <polygon points="50,4 98,92 2,92" fill={color} />;
  }
  if (kind === "ring") {
    return (
      <circle cx={50} cy={50} r={38} fill="none" stroke={color} strokeWidth={22} />
    );
  }
  return (
    <path
      d="M4 50 Q 16 20 28 50 T 52 50 T 76 50 T 100 50"
      fill="none"
      stroke={color}
      strokeWidth={12}
      strokeLinecap="round"
    />
  );
};

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {SHAPES.map((shape, i) => {
        const size = shape.size * Math.min(width, height);
        return (
          <svg
            key={i}
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              overflow: "visible",
              width: size,
              height: size,
              left: shape.x * width - size / 2,
              top: shape.y * height - size / 2,
              translate: `${Math.sin(t * shape.speed + shape.phase) * 26}px ${
                Math.cos(t * shape.speed * 0.8 + shape.phase) * 34
              }px`,
              rotate: `${Math.sin(t * shape.speed * 0.5 + shape.phase) * 14}deg`,
            }}
          >
            <ShapeGraphic kind={shape.kind} color={shape.color} />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};
