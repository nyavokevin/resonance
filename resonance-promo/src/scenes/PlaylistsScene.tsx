import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { COLORS } from "../theme";
import { SHOTS } from "../timeline";

export const PlaylistsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const arrived = SHOTS.playlists.end * fps;

  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.playlists} shadowColor={COLORS.mint}>
        {/* Marker under "Radical Optimism (Extended Versions)" */}
        <div
          style={{
            position: "absolute",
            left: 423,
            top: 220,
            width: 484,
            height: 5,
            borderRadius: 3,
            backgroundColor: COLORS.yellow,
            transformOrigin: "0 50%",
            scale: `${interpolate(frame, [arrived - 6, arrived + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })} 1`,
          }}
        />
      </AppWindow>
      <Caption kicker="We're thrilled to announce" kickerColor={COLORS.mint}>
        {"Create & save playlists"}
      </Caption>
    </AbsoluteFill>
  );
};
