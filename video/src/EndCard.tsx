// The last 3 s: logo, tagline, name, SDGs and the hackathon line, each fading up in turn.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { hasAsset } from './timing';
import { COLORS, END_CARD, LOGO_FILE } from './video.config';

export function EndCard() {
  const frame = useCurrentFrame();
  const appear = (delay: number) => ({
    opacity: interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: 'clamp' }),
    transform: `translateY(${interpolate(frame, [delay, delay + 10], [30, 0], { extrapolateRight: 'clamp' })}px)`,
  });
  return (
    <AbsoluteFill
      style={{
        background: COLORS.light,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 36,
        padding: 90,
        textAlign: 'center',
        fontFamily: 'Arial, sans-serif',
        color: '#183a20',
      }}
    >
      <div style={appear(0)}>
        {hasAsset(LOGO_FILE) ? (
          <Img
            src={staticFile(LOGO_FILE)}
            style={{ width: 260, height: 260, objectFit: 'contain' }}
          />
        ) : (
          <div style={{ fontSize: 140 }}>🚶</div>
        )}
      </div>
      <div
        style={{
          ...appear(6),
          fontSize: 92,
          fontWeight: 800,
          color: COLORS.green,
          lineHeight: 1.1,
        }}
      >
        {END_CARD.tagline}
      </div>
      <div style={{ ...appear(12), fontSize: 64, fontWeight: 700 }}>{END_CARD.name}</div>
      <div style={{ ...appear(18), fontSize: 42 }}>{END_CARD.sdgs}</div>
      <div style={{ ...appear(24), fontSize: 36, opacity: 0.75 }}>{END_CARD.event}</div>
    </AbsoluteFill>
  );
}
