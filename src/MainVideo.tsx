import { AbsoluteFill, Audio, staticFile } from "remotion";
import { Scene3D } from "./Scene3D";
import { Captions } from "./Captions";

export type MainVideoProps = {
  /** File in /public with your recorded voice */
  voiceover: string;
  /** File in /public produced by `npm run transcribe` */
  captions: string;
  title: string;
};

export const MainVideo: React.FC<MainVideoProps> = ({
  voiceover,
  captions,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d17" }}>
      <Scene3D />
      <Captions src={captions} />
      <Audio src={staticFile(voiceover)} />
    </AbsoluteFill>
  );
};
