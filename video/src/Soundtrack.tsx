// Music at -18 dB (dropped to -24 dB when there's a voiceover), fading out over the last second.
// Each file is optional: without it the video is simply silent there.
import { Audio, interpolate, staticFile } from 'remotion';

import { dbToVolume, hasAsset, TOTAL_FRAMES, toFrames } from './timing';
import { AUDIO } from './video.config';

export function Soundtrack() {
  const voice = hasAsset(AUDIO.voiceover);
  const musicLevel = dbToVolume(voice ? AUDIO.musicUnderVoiceDb : AUDIO.musicDb);
  const fadeStart = TOTAL_FRAMES - toFrames(AUDIO.fadeOutSeconds);
  const fade = (frame: number) =>
    interpolate(frame, [fadeStart, TOTAL_FRAMES], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  return (
    <>
      {hasAsset(AUDIO.music) ? (
        <Audio src={staticFile(AUDIO.music)} volume={(f) => musicLevel * fade(f)} />
      ) : null}
      {voice ? <Audio src={staticFile(AUDIO.voiceover)} volume={(f) => fade(f)} /> : null}
    </>
  );
}
