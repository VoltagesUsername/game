/**
 * Piecewise-linear time remap, used to fit each scene into the 3-minute video
 * without rebuilding its animation timeline.
 *
 * knots = [outputFrame, sceneFrame] pairs, both increasing. A scene designed
 * on a longer internal timeline plays its parts faster (holds are compressed
 * more than the action). Re-tune the knots after recording the voiceover.
 */
export const remapTime = (frame: number, knots: [number, number][]) => {
  if (frame <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [o0, s0] = knots[i - 1];
    const [o1, s1] = knots[i];
    if (frame <= o1) return s0 + ((frame - o0) / (o1 - o0)) * (s1 - s0);
  }
  return knots[knots.length - 1][1];
};

/** The inverse: where a scene-timeline frame lands in the final video (used to place sounds). */
export const outFrame = (sceneFrame: number, knots: [number, number][]) => {
  if (sceneFrame <= knots[0][1]) return knots[0][0];
  for (let i = 1; i < knots.length; i++) {
    const [o0, s0] = knots[i - 1];
    const [o1, s1] = knots[i];
    if (sceneFrame <= s1) return o0 + ((sceneFrame - s0) / (s1 - s0)) * (o1 - o0);
  }
  return knots[knots.length - 1][0];
};
