/**
 * Model Loader with Caching Support
 * 
 * Loads 3D models with intelligent caching:
 * - Checks cache first
 * - Downloads if not cached or expired
 * - Stores in cache after download
 */

import { cacheManager } from './cacheManager';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';

interface LoadModelOptions {
    forceRefresh?: boolean;
    ttl?: number;
    onProgress?: (progress: number) => void;
}

/**
 * Load a 3D model with caching support
 */
export async function loadModelWithCache(
    url: string,
    options: LoadModelOptions = {}
): Promise<THREE.Group> {
    const { forceRefresh = false, ttl, onProgress } = options;

    try {
        // Check cache first
        const cachedData = await cacheManager.getCachedModel(url, { forceRefresh, ttl });

        if (cachedData) {
            console.log('Loading model from cache:', url);
            // Load from cached ArrayBuffer
            return await loadFromArrayBuffer(cachedData, url);
        }

        // Download model
        console.log('Downloading model:', url);
        const arrayBuffer = await downloadModel(url, onProgress);

        // Cache the downloaded model
        await cacheManager.cacheModel(url, arrayBuffer);

        // Load from downloaded data
        return await loadFromArrayBuffer(arrayBuffer, url);
    } catch (error) {
        console.error('Failed to load model:', error);
        throw error;
    }
}

/**
 * Download model as ArrayBuffer
 */
async function downloadModel(url: string, onProgress?: (progress: number) => void): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        xhr.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                resolve(xhr.response);
            } else {
                reject(new Error(`Failed to download model: ${xhr.status} ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            reject(new Error('Network error while downloading model'));
        };

        xhr.send();
    });
}

/**
 * Load GLTF from ArrayBuffer
 */
async function loadFromArrayBuffer(arrayBuffer: ArrayBuffer, url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);

        // Parse the ArrayBuffer
        loader.parse(
            arrayBuffer,
            '', // resource path - empty for ArrayBuffer
            (gltf) => {
                draco.dispose();
                resolve(gltf.scene);
            },
            (error) => {
                draco.dispose();
                reject(error);
            }
        );
    });
}

/**
 * Preload multiple models
 */
export async function preloadModels(urls: string[]): Promise<void> {
    console.log(`Preloading ${urls.length} models...`);

    const promises = urls.map(url =>
        loadModelWithCache(url).catch(err => {
            console.error(`Failed to preload model ${url}:`, err);
        })
    );

    await Promise.all(promises);
    console.log('All models preloaded');
}
