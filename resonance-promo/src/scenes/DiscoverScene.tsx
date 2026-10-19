import { AbsoluteFill } from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { COLORS } from "../theme";
import { SHOTS } from "../timeline";

export const DiscoverScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.discover} shadowColor={COLORS.lilac} />
      <Caption kicker="Powered by vibes" kickerColor={COLORS.lilac}>
        Endless mixes by genre
      </Caption>
    </AbsoluteFill>
  );
};
