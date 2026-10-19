import { Audio } from "@remotion/media";
import { getStaticFiles } from "@remotion/studio";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, staticFile, useVideoConfig } from "remotion";
import { Background } from "./components/Background";
import { ChatScene } from "./scenes/ChatScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { DiscoverScene } from "./scenes/DiscoverScene";
import { DownloadScene } from "./scenes/DownloadScene";
import { FriendsScene } from "./scenes/FriendsScene";
import { HookScene } from "./scenes/HookScene";
import { JamScene } from "./scenes/JamScene";
import { PasteLinkScene } from "./scenes/PasteLinkScene";
import { PlaylistsScene } from "./scenes/PlaylistsScene";
import { QueueScene } from "./scenes/QueueScene";
import { SCENES, TRANSITION } from "./timeline";

const MUSIC = "music.mp3";
const VOICEOVER = "voiceover.mp3";

// Audio is optional: a track only plays if its file is in public/.
const Soundtrack: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const files = getStaticFiles().map((file) => file.name);
  const hasVoiceover = files.includes(VOICEOVER);

  return (
    <>
      {files.includes(MUSIC) ? (
        <Audio
          src={staticFile(MUSIC)}
          volume={(f) =>
            (hasVoiceover ? 0.35 : 1) *
            interpolate(f, [durationInFrames - fps, durationInFrames], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
      {hasVoiceover ? <Audio src={staticFile(VOICEOVER)} /> : null}
    </>
  );
};

export const Promo: React.FC = () => {
  const { fps } = useVideoConfig();
  const frames = (seconds: number) => Math.round(seconds * fps);
  const transition = frames(TRANSITION);
  const slideTiming = springTiming({
    config: { damping: 200 },
    durationInFrames: transition,
  });
  const fadeTiming = linearTiming({ durationInFrames: transition });

  return (
    <AbsoluteFill>
      <Background />
      <Soundtrack />
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Hook"
          durationInFrames={frames(SCENES.hook)}
          premountFor={fps}
        >
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={slideTiming}
        />
        <TransitionSeries.Sequence
          name="Paste any link"
          durationInFrames={frames(SCENES.pasteLink)}
          premountFor={fps}
        >
          <PasteLinkScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />
        <TransitionSeries.Sequence
          name="Playlists"
          durationInFrames={frames(SCENES.playlists)}
          premountFor={fps}
        >
          <PlaylistsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={slideTiming}
        />
        <TransitionSeries.Sequence
          name="Download"
          durationInFrames={frames(SCENES.download)}
          premountFor={fps}
        >
          <DownloadScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />
        <TransitionSeries.Sequence
          name="Discover"
          durationInFrames={frames(SCENES.discover)}
          premountFor={fps}
        >
          <DiscoverScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={slideTiming}
        />
        <TransitionSeries.Sequence
          name="Friends"
          durationInFrames={frames(SCENES.friends)}
          premountFor={fps}
        >
          <FriendsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={slideTiming}
        />
        <TransitionSeries.Sequence
          name="Jam"
          durationInFrames={frames(SCENES.jam)}
          premountFor={fps}
        >
          <JamScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />
        <TransitionSeries.Sequence
          name="Shared queue"
          durationInFrames={frames(SCENES.queue)}
          premountFor={fps}
        >
          <QueueScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={slideTiming}
        />
        <TransitionSeries.Sequence
          name="Chat"
          durationInFrames={frames(SCENES.chat)}
          premountFor={fps}
        >
          <ChatScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />
        <TransitionSeries.Sequence
          name="Closing"
          durationInFrames={frames(SCENES.closing)}
          premountFor={fps}
        >
          <ClosingScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
