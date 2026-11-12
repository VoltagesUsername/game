import { Series } from "remotion";
import { Scene1, SCENE1_FRAMES } from "./Scene1";
import { Scene2, SCENE2_FRAMES } from "./Scene2";
import { Scene3, SCENE3_FRAMES } from "./Scene3";
import { Scene4, SCENE4_FRAMES } from "./Scene4";

// Scene 4 starts on the same map Scene 3 ends on: they crossfade over this many frames
const CROSSFADE_3_4 = 30;

/** All finished scenes back to back. Add new scenes here as they are made. */
export const MONGOL_VIDEO_FRAMES = SCENE1_FRAMES + SCENE2_FRAMES + SCENE3_FRAMES + SCENE4_FRAMES - CROSSFADE_3_4;

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
    <Series.Sequence durationInFrames={SCENE4_FRAMES} offset={-CROSSFADE_3_4}>
      <Scene4 />
    </Series.Sequence>
  </Series>
);
