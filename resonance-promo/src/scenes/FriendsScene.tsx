import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { COLORS, HEADLINE_FONT } from "../theme";
import { BEATS, SHOTS } from "../timeline";

export const FriendsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const highlight = spring({
    frame: frame - BEATS.friends.highlight * fps,
    fps,
    config: { damping: 9, mass: 0.5 },
  });

  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.friends} shadowColor={COLORS.pink}>
        {/* Friend row of friends.png */}
        <div
          style={{
            position: "absolute",
            left: 241,
            top: 312,
            width: 580,
            height: 72,
            boxSizing: "border-box",
            borderRadius: 10,
            border: `3px solid ${COLORS.accent}`,
            opacity: highlight,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 756,
            top: 286,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: COLORS.pink,
            color: COLORS.bg,
            fontFamily: HEADLINE_FONT,
            fontSize: 22,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            rotate: "10deg",
            scale: highlight,
          }}
        >
          +1
        </div>
      </AppWindow>
      <Caption kicker="Synergy, but for humans" kickerColor={COLORS.pink}>
        Add your friends
      </Caption>
    </AbsoluteFill>
  );
};
