// The two videos Remotion can render: "Vertical" (1080 × 1920) and "Landscape" (1920 × 1080).
// Turn the Traditional Chinese subtitle lines on with the showZh prop in the Studio.
import { Composition } from 'remotion';

import { Landscape } from './Landscape';
import { checkTimeline, TOTAL_FRAMES } from './timing';
import { Vertical } from './Vertical';
import { FPS, HEIGHT, WIDTH } from './video.config';

checkTimeline();

export function Root() {
  return (
    <>
      <Composition
        id="Vertical"
        component={Vertical}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ showZh: false }}
      />
      <Composition
        id="Landscape"
        component={Landscape}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ showZh: false }}
      />
    </>
  );
}
