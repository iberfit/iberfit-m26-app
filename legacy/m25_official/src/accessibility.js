function normalizeHex(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (value.length === 3) return value.split('').map((char) => `${char}${char}`).join('');
  if (value.length !== 6) throw new Error(`Color hexadecimal inválido: ${hex}`);
  return value;
}

export function hexToRgb(hex) {
  const value = normalizeHex(hex);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function auditIberfitPalette() {
  const checks = [
    { name: 'texto principal sobre crema', foreground: '#16221B', background: '#F7F4EE', minimum: 4.5 },
    { name: 'crema sobre bosque oscuro', foreground: '#F7F4EE', background: '#10271C', minimum: 4.5 },
    { name: 'bosque sobre dorado', foreground: '#10271C', background: '#B8973A', minimum: 4.5 },
    { name: 'texto secundario sobre crema', foreground: '#5D665F', background: '#F7F4EE', minimum: 4.5 },
  ];
  return checks.map((check) => ({ ...check, ratio: contrastRatio(check.foreground, check.background), pass: contrastRatio(check.foreground, check.background) >= check.minimum }));
}

export function accessibleTarget(size, minimum = 44) {
  return Number(size?.width || 0) >= minimum && Number(size?.height || 0) >= minimum;
}
