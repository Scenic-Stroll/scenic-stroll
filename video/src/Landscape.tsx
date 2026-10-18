// 16:9 version for a pitch screen: the vertical video in the middle, a blurred copy of it
// filling the background, and the captions moved to the left so they never cover the app.
import { AbsoluteFill } from 'remotion';

import { Captions } from './Captions';
import { Vertical } from './Vertical';
import { HEIGHT, WIDTH } from './video.config';

const SCALE = 1080 / HEIGHT; // fit the 1920-tall video into 1080
const BG_SCALE = 1920 / WIDTH; // stretch it to cover the width behind

export function Landscape({ showZh }: { showZh: boolean }) {
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Layer scale={BG_SCALE} style={{ filter: 'blur(40px) brightness(0.65)' }}>
        <Vertical showZh={false} showCaptions={false} withAudio={false} />
      </Layer>
      <Layer scale={SCALE} style={{ boxShadow: '0 0 80px rgba(0,0,0,0.5)' }}>
        <Vertical showZh={false} showCaptions={false} />
      </Layer>
      <Captions showZh={showZh} layout="side" />
    </AbsoluteFill>
  );
}

function Layer({
  scale,
  style,
  children,
}: {
  scale: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width: WIDTH,
        height: HEIGHT,
        left: (1920 - WIDTH) / 2,
        top: (1080 - HEIGHT) / 2,
        transform: `scale(${scale})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
