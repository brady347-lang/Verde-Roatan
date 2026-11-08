/**
 * Relative camera brightness only. This is deliberately NOT converted to lux:
 * camera exposure, HDR, white balance and scene reflectance vary by device.
 */
export type CameraBrightnessBand = 'very_dim' | 'dim' | 'moderate' | 'bright' | 'very_bright';

export interface CameraBrightnessEstimate {
  score: number;
  band: CameraBrightnessBand;
  label: string;
}

export function estimateCameraBrightness(data: Uint8ClampedArray): CameraBrightnessEstimate {
  if (data.length < 4) throw new Error('Camera frame is empty.');
  const pixelCount = Math.floor(data.length / 4);
  const stride = Math.max(1, Math.floor(pixelCount / 600));
  let total = 0;
  let count = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    // Rec. 709 luminance, normalized to the 8-bit camera image range.
    total += (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) / 255;
    count += 1;
  }
  const score = Math.round((total / Math.max(1, count)) * 100);
  const band: CameraBrightnessBand = score < 8 ? 'very_dim'
    : score < 20 ? 'dim'
      : score < 45 ? 'moderate'
        : score < 70 ? 'bright' : 'very_bright';
  const labels: Record<CameraBrightnessBand, string> = {
    very_dim: 'Very dim scene',
    dim: 'Dim scene',
    moderate: 'Moderate scene brightness',
    bright: 'Bright scene',
    very_bright: 'Very bright scene'
  };
  return { score, band, label: labels[band] };
}
