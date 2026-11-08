import assert from 'node:assert/strict';
import { estimateCameraBrightness } from './cameraBrightness.ts';

const frame = (value) => {
  const pixels = new Uint8ClampedArray(40 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  return pixels;
};

const dark = estimateCameraBrightness(frame(8));
const mid = estimateCameraBrightness(frame(100));
const bright = estimateCameraBrightness(frame(230));
assert.ok(dark.score < mid.score && mid.score < bright.score, 'brightness score must rise with image luminance');
assert.equal(dark.band, 'very_dim');
assert.equal(bright.band, 'very_bright');
assert.throws(() => estimateCameraBrightness(new Uint8ClampedArray()), /empty/i);
console.log('cameraBrightness tests passed');
