// One video file filling its box, trimmed and sped up as the config says. If the file isn't in
// video/assets/ yet, a labelled card says what to film, so the preview works as a storyboard.
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';

import { hasAsset, toFrames } from './timing';
import type { Scene } from './video.config';

export function Clip({ scene }: { scene: Scene }) {
  if (!hasAsset(scene.file)) return <Placeholder scene={scene} />;
  return (
    <OffthreadVideo
      src={staticFile(scene.file)}
      trimBefore={toFrames(scene.trimStart ?? 0)}
      playbackRate={scene.speed ?? 1}
      muted // the soundtrack is music + voiceover only
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}

function Placeholder({ scene }: { scene: Scene }) {
  return (
    <AbsoluteFill
      style={{
        background: scene.kind === 'problem' ? '#5b5348' : '#dfe9df',
        color: scene.kind === 'problem' ? '#fff' : '#1d3b22',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
        textAlign: 'center',
        fontFamily: 'Arial, sans-serif',
        gap: 24,
      }}
    >
      <div style={{ fontSize: 90, fontWeight: 800 }}>{scene.id}</div>
      <div style={{ fontSize: 44, lineHeight: 1.3 }}>{scene.shot}</div>
      <div style={{ fontSize: 30, opacity: 0.7 }}>Missing: assets/{scene.file}</div>
    </AbsoluteFill>
  );
}
