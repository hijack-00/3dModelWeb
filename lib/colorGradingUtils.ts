/**
 * Color grading utilities for image adjustments
 */

export interface ColorGradingParams {
    brightness: number;      // -100 to 100 (default: 0)
    exposure: number;        // -2 to 2 (default: 0)
    contrast: number;        // -100 to 100 (default: 0)
    saturation: number;      // -100 to 100 (default: 0)
    hue: number;            // -180 to 180 (default: 0)
    temperature: number;     // -100 to 100 (default: 0) - warm/cool
    tint: number;           // -100 to 100 (default: 0) - magenta/green
    vibrance: number;       // -100 to 100 (default: 0)
    highlights: number;     // -100 to 100 (default: 0)
    shadows: number;        // -100 to 100 (default: 0)
    gamma: number;          // 0.1 to 3 (default: 1)
}

export const DEFAULT_COLOR_GRADING: ColorGradingParams = {
    brightness: 0,
    exposure: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    temperature: 0,
    tint: 0,
    vibrance: 0,
    highlights: 0,
    shadows: 0,
    gamma: 1,
};

/**
 * Apply color grading to an image and return the processed image data URL
 */
export async function applyColorGrading(
    imageSource: string,
    params: Partial<ColorGradingParams>
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Merge with defaults
            const grading: ColorGradingParams = { ...DEFAULT_COLOR_GRADING, ...params };

            // Apply color grading
            processImageData(data, grading);

            // Put processed data back
            ctx.putImageData(imageData, 0, 0);

            // Return as data URL
            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageSource;
    });
}

/**
 * Process image data with color grading parameters
 */
function processImageData(data: Uint8ClampedArray, params: ColorGradingParams) {
    // Pre-calculate values
    const brightnessFactor = params.brightness / 100;
    const exposureFactor = Math.pow(2, params.exposure);
    const contrastFactor = (params.contrast + 100) / 100;
    const saturationFactor = (params.saturation + 100) / 100;
    const hueDeg = params.hue;
    const tempFactor = params.temperature / 100;
    const tintFactor = params.tint / 100;
    const vibranceFactor = params.vibrance / 100;
    const highlightsFactor = params.highlights / 100;
    const shadowsFactor = params.shadows / 100;
    const gammaValue = params.gamma;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;
        const a = data[i + 3];

        // Skip transparent pixels
        if (a === 0) continue;

        // 1. Exposure
        if (params.exposure !== 0) {
            r *= exposureFactor;
            g *= exposureFactor;
            b *= exposureFactor;
        }

        // 2. Brightness
        if (params.brightness !== 0) {
            r += brightnessFactor;
            g += brightnessFactor;
            b += brightnessFactor;
        }

        // 3. Contrast
        if (params.contrast !== 0) {
            r = ((r - 0.5) * contrastFactor) + 0.5;
            g = ((g - 0.5) * contrastFactor) + 0.5;
            b = ((b - 0.5) * contrastFactor) + 0.5;
        }

        // 4. Gamma
        if (params.gamma !== 1) {
            r = Math.pow(r, 1 / gammaValue);
            g = Math.pow(g, 1 / gammaValue);
            b = Math.pow(b, 1 / gammaValue);
        }

        // 5. Highlights and Shadows
        if (params.highlights !== 0 || params.shadows !== 0) {
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

            if (luminance > 0.5 && params.highlights !== 0) {
                // Adjust highlights
                const factor = 1 + (highlightsFactor * (luminance - 0.5) * 2);
                r *= factor;
                g *= factor;
                b *= factor;
            }

            if (luminance < 0.5 && params.shadows !== 0) {
                // Adjust shadows
                const factor = 1 + (shadowsFactor * (0.5 - luminance) * 2);
                r *= factor;
                g *= factor;
                b *= factor;
            }
        }

        // 6. Temperature (warm/cool)
        if (params.temperature !== 0) {
            r += tempFactor * 0.3;
            b -= tempFactor * 0.3;
        }

        // 7. Tint (magenta/green)
        if (params.tint !== 0) {
            r += tintFactor * 0.2;
            g -= tintFactor * 0.2;
            b += tintFactor * 0.2;
        }

        // 8. Saturation & Vibrance
        if (params.saturation !== 0 || params.vibrance !== 0) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Standard saturation
            if (params.saturation !== 0) {
                r = gray + (r - gray) * saturationFactor;
                g = gray + (g - gray) * saturationFactor;
                b = gray + (b - gray) * saturationFactor;
            }

            // Vibrance (affects less saturated colors more)
            if (params.vibrance !== 0) {
                const maxRGB = Math.max(r, g, b);
                const minRGB = Math.min(r, g, b);
                const currentSat = maxRGB - minRGB;
                const vibranceAmount = (1 - currentSat) * vibranceFactor;

                r = gray + (r - gray) * (1 + vibranceAmount);
                g = gray + (g - gray) * (1 + vibranceAmount);
                b = gray + (b - gray) * (1 + vibranceAmount);
            }
        }

        // 9. Hue rotation
        if (params.hue !== 0) {
            const hsl = rgbToHsl(r, g, b);
            hsl.h = (hsl.h + hueDeg) % 360;
            if (hsl.h < 0) hsl.h += 360;
            const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
            r = rgb.r;
            g = rgb.g;
            b = rgb.b;
        }

        // Clamp and write back
        data[i] = Math.max(0, Math.min(255, r * 255));
        data[i + 1] = Math.max(0, Math.min(255, g * 255));
        data[i + 2] = Math.max(0, Math.min(255, b * 255));
    }
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h = h / 360;

    if (s === 0) {
        return { r: l, g: l, b: l };
    }

    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
        r: hue2rgb(p, q, h + 1 / 3),
        g: hue2rgb(p, q, h),
        b: hue2rgb(p, q, h - 1 / 3),
    };
}

/**
 * Quick presets for common adjustments
 */
export const COLOR_GRADING_PRESETS: Record<string, Partial<ColorGradingParams>> = {
    none: DEFAULT_COLOR_GRADING,
    bright: { brightness: 20, exposure: 0.3, contrast: 10 },
    dark: { brightness: -20, exposure: -0.3, contrast: 15 },
    vibrant: { saturation: 30, vibrance: 20, contrast: 10 },
    muted: { saturation: -30, contrast: -10 },
    warm: { temperature: 30, brightness: 5 },
    cool: { temperature: -30, tint: -10 },
    vintage: { saturation: -20, temperature: 20, contrast: -10, gamma: 1.1 },
    dramatic: { contrast: 40, highlights: -20, shadows: 20, saturation: 10 },
    soft: { contrast: -20, highlights: 10, saturation: -10 },
    blackAndWhite: { saturation: -100 },
};
