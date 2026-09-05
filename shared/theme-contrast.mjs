/** sRGB colors, used by theme application and the exhaustive contrast audit. */
export function rgb(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

export function mix(a, b, weight) {
  return a.map((value, index) => value * (1 - weight) + b[index] * weight);
}

export function contrast(a, b) {
  const luminance = (color) => color.reduce((sum, channel, index) => sum +
    [0.2126, 0.7152, 0.0722][index] * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4), 0);
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

export function accentForeground(hex) {
  const color = rgb(hex);
  return contrast(color, [0, 0, 0]) >= contrast(color, [1, 1, 1]) ? "#000000" : "#ffffff";
}
