// A plain rounded phone drawn in code (no real device or brand). Callouts are placed in
// screen fractions, so they stay on the right button if the frame size changes.
import type { ReactNode } from 'react';

/** Screen box inside the 1080 × 1920 frame. Captions sit above it, in the top 400 px. */
export const PHONE = { width: 640, height: 1386, top: 430, bezel: 18, radius: 78 };

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: PHONE.top - PHONE.bezel,
        left: (1080 - PHONE.width) / 2 - PHONE.bezel,
        width: PHONE.width + PHONE.bezel * 2,
        height: PHONE.height + PHONE.bezel * 2,
        borderRadius: PHONE.radius + PHONE.bezel,
        background: '#141414',
        padding: PHONE.bezel,
        boxShadow: '0 40px 90px rgba(20, 60, 30, 0.28)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: PHONE.width,
          height: PHONE.height,
          borderRadius: PHONE.radius,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        {children}
      </div>
    </div>
  );
}
