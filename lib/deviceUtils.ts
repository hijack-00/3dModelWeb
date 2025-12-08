/**
 * Device detection and performance profiling utilities
 */

export type DeviceProfile = 'low' | 'medium' | 'high';

export interface QualitySettings {
    textureSize: number;
    shadowsEnabled: boolean;
    backgroundSegments: number;
    ambientLightIntensity: number;
    spotLightIntensity: number;
    contactShadowOpacity: number;
    maxRecordingFPS: number;
    recordingBitrate: number;
    antialias: boolean;
    pixelRatio: number;
}

/**
 * Detect device capabilities and return a quality profile
 */
export function getDeviceProfile(): DeviceProfile {
    // Check if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );

    // Check memory (if available)
    const memory = (navigator as any).deviceMemory || 4;

    // Check GPU tier (basic heuristic)
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    let gpuTier: 'low' | 'medium' | 'high' = 'medium';

    if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string).toLowerCase();

            // Simple GPU detection - expand as needed
            if (renderer.includes('mali') || renderer.includes('adreno 3') || renderer.includes('adreno 4')) {
                gpuTier = 'low';
            } else if (renderer.includes('adreno 6') || renderer.includes('adreno 7') || renderer.includes('apple')) {
                gpuTier = 'high';
            }
        }
    }

    // Determine profile
    if (isMobile) {
        if (memory < 3 || gpuTier === 'low') {
            return 'low';
        } else if (memory < 6 || gpuTier === 'medium') {
            return 'medium';
        }
        return 'medium'; // Even high-end mobile gets medium
    }

    // Desktop
    if (memory < 4) {
        return 'medium';
    }
    return 'high';
}

/**
 * Get quality settings based on device profile
 */
export function getQualitySettings(profile: DeviceProfile): QualitySettings {
    const settings: Record<DeviceProfile, QualitySettings> = {
        low: {
            textureSize: 512,
            shadowsEnabled: false,
            backgroundSegments: 16,
            ambientLightIntensity: 0.7,
            spotLightIntensity: 0.5,
            contactShadowOpacity: 0,
            maxRecordingFPS: 24,
            recordingBitrate: 2000000, // 2 Mbps
            antialias: false,
            pixelRatio: 1,
        },
        medium: {
            textureSize: 1024,
            shadowsEnabled: true,
            backgroundSegments: 32,
            ambientLightIntensity: 0.5,
            spotLightIntensity: 0.8,
            contactShadowOpacity: 0.3,
            maxRecordingFPS: 30,
            recordingBitrate: 3500000, // 3.5 Mbps
            antialias: true,
            pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        },
        high: {
            textureSize: 2048,
            shadowsEnabled: true,
            backgroundSegments: 60,
            ambientLightIntensity: 0.5,
            spotLightIntensity: 1,
            contactShadowOpacity: 0.5,
            maxRecordingFPS: 60,
            recordingBitrate: 5000000, // 5 Mbps
            antialias: true,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
        },
    };

    return settings[profile];
}

/**
 * Check if running in Flutter WebView
 */
export function isFlutterWebView(): boolean {
    return typeof (window as any).DownloadHandler !== 'undefined';
}

/**
 * Compress image before upload (for sticker uploads)
 */
export async function compressImage(
    file: File,
    maxWidth: number = 1024,
    maxHeight: number = 1024,
    quality: number = 0.85
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = width * ratio;
                    height = height * ratio;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to data URL with compression
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target?.result as string;
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Debounce function for texture updates
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}

/**
 * Dispose Three.js resources to free memory
 */
export function disposeThreeObject(obj: any) {
    if (!obj) return;

    if (obj.geometry) {
        obj.geometry.dispose();
    }

    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: any) => disposeMaterial(mat));
        } else {
            disposeMaterial(obj.material);
        }
    }

    if (obj.dispose && typeof obj.dispose === 'function') {
        obj.dispose();
    }
}

function disposeMaterial(mat: any) {
    if (!mat) return;

    // Dispose all texture maps
    const textures = [
        'map', 'normalMap', 'roughnessMap', 'metalnessMap',
        'aoMap', 'emissiveMap', 'alphaMap', 'lightMap',
        'bumpMap', 'displacementMap', 'specularMap'
    ];

    textures.forEach(texName => {
        if (mat[texName] && mat[texName].dispose) {
            mat[texName].dispose();
        }
    });

    if (mat.dispose) {
        mat.dispose();
    }
}
