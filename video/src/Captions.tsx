// Burned-in captions: dark pill over the problem footage (0–6 s), green pill over the app.
// They pop in with a spring and sit at least 120 px from the screen edge (safe area).
import { Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { toFrames } from './timing';
import { CAPTIONS, COLORS, HARD_CUT_AT, type Caption } from './video.config';

const SAFE = 120;

export function Captions({ showZh, layout }: { showZh: boolean; layout: 'over' | 'side' }) {
  return (
    <>
      {CAPTIONS.map((c) => (
        <Sequence
          key={c.start}
          from={toFrames(c.start)}
          durationInFrames={toFrames(c.end - c.start)}
          layout="none"
        >
          <CaptionPill caption={c} showZh={showZh} layout={layout} />
        </Sequence>
      ))}
    </>
  );
}

function CaptionPill({
  caption,
  showZh,
  layout,
}: {
  caption: Caption;
  showZh: boolean;
  layout: 'over' | 'side';
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const problem = caption.start < HARD_CUT_AT;
  // Over the footage: problem captions low on the screen, app captions above the phone.
  const place =
    layout === 'side'
      ? { left: 70, width: 520, top: '50%' }
      : problem
        ? { left: 70, right: 70, bottom: SAFE + 160 }
        : { left: 70, right: 70, top: SAFE };
  return (
    <div
      style={{
        position: 'absolute',
        ...place,
        display: 'flex',
        justifyContent: 'center',
        transform: `${layout === 'side' ? 'translateY(-50%) ' : ''}scale(${scale})`,
        fontFamily: 'Arial, "Noto Sans HK", "Microsoft JhengHei", sans-serif',
      }}
    >
      <div
        style={{
          background: problem ? COLORS.darkPill : COLORS.green,
          color: '#fff',
          borderRadius: 36,
          padding: '22px 38px',
          textAlign: 'center',
          maxWidth: '100%',
        }}
      >
        <div style={{ fontSize: layout === 'side' ? 52 : 66, fontWeight: 800, lineHeight: 1.18 }}>
          {caption.en}
        </div>
        {showZh ? (
          <div style={{ fontSize: layout === 'side' ? 38 : 44, marginTop: 10, opacity: 0.92 }}>
            {caption.zh}
          </div>
        ) : null}
      </div>
    </div>
  );
}
