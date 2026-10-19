import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { useVideoConfig } from "remotion";

export const BODY_FONT = loadInter("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
}).fontFamily;

export const HEADLINE_FONT = loadPoppins("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
}).fontFamily;

export const COLORS = {
  bg: "#1A1B20",
  accent: "#5B5BF7",
  pink: "#FFB3D1",
  mint: "#A8F0D4",
  yellow: "#FFE27A",
  lilac: "#C9BBFF",
  white: "#FFFFFF",
  // Sampled from the app screenshots.
  appBase: "#1e1f22",
  appPanel: "#2b2d31",
  appCard: "#313338",
  appEdge: "#3f4147",
  appInkSoft: "#b5bac1",
  appInkMuted: "#80848e",
} as const;

export const PASTELS = [
  COLORS.pink,
  COLORS.mint,
  COLORS.yellow,
  COLORS.lilac,
] as const;

type Box = { left: number; top: number; width: number; height: number };

export type Layout = {
  vertical: boolean;
  window: Box;
  caption: Box;
  headlineSize: number;
  captionSize: number;
};

const VERTICAL: Layout = {
  vertical: true,
  window: { left: 70, top: 230, width: 940, height: 1000 },
  caption: { left: 80, top: 1310, width: 920, height: 480 },
  headlineSize: 104,
  captionSize: 92,
};

const WIDE: Layout = {
  vertical: false,
  window: { left: 780, top: 150, width: 1040, height: 780 },
  caption: { left: 130, top: 150, width: 590, height: 780 },
  headlineSize: 100,
  captionSize: 84,
};

// Vertical puts the caption in the bottom third, wide puts it on the left.
export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  return height > width ? VERTICAL : WIDE;
};
