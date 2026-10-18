// A green ring (circle) or pulsing outline (box) drawing the eye to one button in a recording.
// Positions come from CALLOUTS in video.config.ts, as fractions of the phone screen.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { PHONE } from './PhoneFrame';
import { COLORS, type Callout as CalloutConfig } from './video.config';

/** `frame` counts from the moment the callout appears. */
export function Callout({ callout }: { callout: CalloutConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame, fps, config: { damping: 12 } });
  const pulse = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 3);
  const total = callout.duration * fps;
  const opacity = interpolate(frame, [0, 4, total - 6, total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const w = callout.w * PHONE.width;
  const h = (callout.shape === 'circle' ? callout.w : callout.h) * PHONE.width;
  return (
    <div
      style={{
        position: 'absolute',
        left: callout.x * PHONE.width - w / 2,
        top: callout.y * PHONE.height - h / 2,
        width: w,
        height: h,
        borderRadius: callout.shape === 'circle' ? '50%' : 28,
        border: `8px solid ${COLORS.accent}`,
        boxShadow: `0 0 0 6px rgba(27, 161, 54, 0.25)`,
        transform: `scale(${grow * pulse})`,
        opacity,
      }}
    />
  );
}
