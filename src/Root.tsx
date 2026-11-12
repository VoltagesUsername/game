import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { MainVideo, MainVideoProps } from "./MainVideo";
import { SteppeNight } from "./mongol/SteppeNight";
import { Scene1 } from "./mongol/Scene1";
import { Scene2, SCENE2_FRAMES } from "./mongol/Scene2";
import { Scene3, SCENE3_FRAMES } from "./mongol/Scene3";
import { MongolVideo, MONGOL_VIDEO_FRAMES } from "./mongol/MongolVideo";

const FPS = 30;

// Make the video exactly as long as your voiceover (+ a short tail).
const calculateMetadata: CalculateMetadataFunction<MainVideoProps> = async ({
  props,
}) => {
  try {
    const seconds = await getAudioDurationInSeconds(staticFile(props.voiceover));
    return { durationInFrames: Math.ceil((seconds + 1) * FPS) };
  } catch {
    // No voiceover yet -> fall back to 10 seconds so the studio still works.
    return { durationInFrames: 10 * FPS };
  }
};

const defaultProps: MainVideoProps = {
  voiceover: "voiceover.wav",
  captions: "captions.json",
  title: "Hello from three.js + Remotion",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainVideo"
        component={MainVideo}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={10 * FPS}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="MainVideoVertical"
        component={MainVideo}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={10 * FPS}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="MongolVideo"
        component={MongolVideo}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={MONGOL_VIDEO_FRAMES}
      />
      <Composition
        id="Scene1"
        component={Scene1}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={30 * FPS}
      />
      <Composition
        id="Scene2"
        component={Scene2}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={SCENE2_FRAMES}
      />
      <Composition
        id="Scene3"
        component={Scene3}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={SCENE3_FRAMES}
      />
      <Composition
        id="MongolTest"
        component={SteppeNight}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={10 * FPS}
      />
    </>
  );
};
