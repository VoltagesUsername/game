import { Series } from "remotion";
import { Scene1, SCENE1_FRAMES } from "./Scene1";
import { Scene2, SCENE2_FRAMES } from "./Scene2";
import { Scene3, SCENE3_FRAMES } from "./Scene3";

/** All finished scenes back to back. Add new scenes here as they are made. */
export const MONGOL_VIDEO_FRAMES = SCENE1_FRAMES + SCENE2_FRAMES + SCENE3_FRAMES;

export const MongolVideo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={SCENE1_FRAMES}>
      <Scene1 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={SCENE2_FRAMES}>
      <Scene2 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={SCENE3_FRAMES}>
      <Scene3 />
    </Series.Sequence>
  </Series>
);
