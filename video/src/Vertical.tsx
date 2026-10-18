// The main 1080 × 1920 video: scenes, highlight callouts, captions, the white flash at the
// problem → app cut, and the soundtrack. Everything is timed from video.config.ts.
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';

import { Callout } from './Callout';
import { Captions } from './Captions';
import { PHONE } from './PhoneFrame';
import { SceneView } from './SceneView';
import { Soundtrack } from './Soundtrack';
import { toFrames } from './timing';
import { CALLOUTS, COLORS, HARD_CUT_AT, SCENES, TRANSITION_FRAMES, WIDTH } from './video.config';

export type VerticalProps = { showZh: boolean; showCaptions?: boolean; withAudio?: boolean };

export function Vertical({ showZh, showCaptions = true, withAudio = true }: VerticalProps) {
  return (
    <AbsoluteFill style={{ background: COLORS.light }}>
      {SCENES.map((scene, i) => {
        // Start a few frames early so the new scene slides in over the end of the old one.
        const slide = i === 0 || scene.start === HARD_CUT_AT ? 0 : TRANSITION_FRAMES;
        const from = toFrames(scene.start) - slide;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={toFrames(scene.end) - from}>
            <SceneView scene={scene} slideFrames={slide} />
          </Sequence>
        );
      })}
      {CALLOUTS.map((c) => (
        <Sequence
          key={`${c.scene}-${c.at}`}
          from={toFrames(c.at)}
          durationInFrames={toFrames(c.duration)}
          layout="none"
        >
          {/* Same box as the phone screen, so callout x / y are screen fractions. */}
          <div
            style={{
              position: 'absolute',
              top: PHONE.top,
              left: (WIDTH - PHONE.width) / 2,
              width: PHONE.width,
              height: PHONE.height,
            }}
          >
            <Callout callout={c} />
          </div>
        </Sequence>
      ))}
      {showCaptions ? <Captions showZh={showZh} layout="over" /> : null}
      <Flash />
      {withAudio ? <Soundtrack /> : null}
    </AbsoluteFill>
  );
}

/** Short white flash on the hard cut from the problem to the app. */
function Flash() {
  const frame = useCurrentFrame();
  const cut = toFrames(HARD_CUT_AT);
  const opacity = interpolate(frame, [cut - 1, cut, cut + 6], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ background: '#fff', opacity, pointerEvents: 'none' }} />;
}
