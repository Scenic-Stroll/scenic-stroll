// One scene of the timeline. Problem shots fill the screen with a harsh warm grade and a
// slight hand-held shake; app shots sit in the phone frame on a light background. Each scene
// slides in over the previous one, except right after the hard cut at 6 s.
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { Clip } from './Clip';
import { EndCard } from './EndCard';
import { PhoneFrame } from './PhoneFrame';
import { hasAsset } from './timing';
import { COLORS, LOGO_FILE, WIDTH, type Scene } from './video.config';

export function SceneView({ scene, slideFrames }: { scene: Scene; slideFrames: number }) {
  const frame = useCurrentFrame();
  const x =
    slideFrames > 0
      ? interpolate(frame, [0, slideFrames], [WIDTH, 0], {
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.cubic),
        })
      : 0;
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}px)` }}>
      {scene.kind === 'problem' ? <Problem scene={scene} /> : null}
      {scene.kind === 'app' ? <AppShot scene={scene} /> : null}
      {scene.kind === 'end' ? <EndCard /> : null}
    </AbsoluteFill>
  );
}

function Problem({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  // A few pixels of wobble; scaled up 4 % so the edges never show.
  const dx = Math.sin(frame * 1.7) * 4;
  const dy = Math.cos(frame * 1.3) * 4;
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${dx}px, ${dy}px) scale(1.04)`,
        filter: 'saturate(0.7) sepia(0.18) contrast(1.12) brightness(1.04)',
      }}
    >
      <Clip scene={scene} />
    </AbsoluteFill>
  );
}

function AppShot({ scene }: { scene: Scene }) {
  return (
    <AbsoluteFill style={{ background: COLORS.light }}>
      <PhoneFrame>
        <Clip scene={scene} />
      </PhoneFrame>
      {scene.logo ? <SmallLogo /> : null}
    </AbsoluteFill>
  );
}

function SmallLogo() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: 70,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontFamily: 'Arial, sans-serif',
        fontSize: 52,
        fontWeight: 800,
        color: COLORS.green,
      }}
    >
      {hasAsset(LOGO_FILE) ? (
        <Img src={staticFile(LOGO_FILE)} style={{ width: 84, height: 84, objectFit: 'contain' }} />
      ) : null}
      Scenic Stroll
    </div>
  );
}
