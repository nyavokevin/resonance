import type React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { BODY_FONT, COLORS, useLayout } from "../theme";
import { BEATS, SHOTS } from "../timeline";

const Bubble: React.FC<{
  readonly at: number;
  readonly side: "left" | "right";
  readonly top: number;
  readonly children: string;
}> = ({ at, side, top, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { window } = useLayout();
  const mine = side === "right";

  return (
    <div
      style={{
        position: "absolute",
        left: window.left + 50,
        top: window.top + top * window.height,
        width: window.width - 100,
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          fontFamily: BODY_FONT,
          fontSize: 44,
          fontWeight: 700,
          color: mine ? COLORS.white : COLORS.bg,
          backgroundColor: mine ? COLORS.accent : COLORS.mint,
          padding: "22px 36px",
          borderRadius: mine ? "36px 36px 8px 36px" : "36px 36px 36px 8px",
          boxShadow: "0 18px 40px rgba(0, 0, 0, 0.4)",
          transformOrigin: mine ? "100% 100%" : "0% 100%",
          scale: spring({
            frame: frame - at * fps,
            fps,
            config: { damping: 9, mass: 0.6 },
          }),
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const ChatScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <AppWindow shot={SHOTS.chat} shadowColor={COLORS.pink} />
      <Bubble at={BEATS.chat.firstBubble} side="left" top={0.52}>
        who queued this banger??
      </Bubble>
      <Bubble at={BEATS.chat.secondBubble} side="right" top={0.72}>
        me. you&apos;re welcome.
      </Bubble>
      <Caption kicker="Disruptive" kickerColor={COLORS.yellow}>
        Chat while you listen
      </Caption>
    </AbsoluteFill>
  );
};
