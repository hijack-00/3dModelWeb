/**
 * Cache Manager for 3D Models and API Responses
 * 
 * This module provides caching functionality for:
 * - 3D model files (GLB/GLTF)
 * - API responses
 * - Textures and images
 * - Environment maps
 * 
 * Supports both browser and Flutter WebView environments
 */

interface CacheItem<T> {
    data: T;
    timestamp: number;
    version: string;
    etag?: string;
}

interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
    version?: string; // Cache version for invalidation
    forceRefresh?: boolean;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_VERSION = '1.0';

class CacheManager {
    private memoryCache: Map<string, any> = new Map();
    private dbName = '3dmodel-cache';
    private dbVersion = 1;
    private db: IDBDatabase | null = null;
    private dbInitPromise: Promise<void> | null = null;

    constructor() {
        this.dbInitPromise = this.initIndexedDB();
    }

    /**
     * Initialize IndexedDB for persistent caching
     */
    private async initIndexedDB(): Promise<void> {
        if (typeof window === 'undefined' || !window.indexedDB) {
            console.warn('IndexedDB not available');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object stores if they don't exist
                if (!db.objectStoreNames.contains('models')) {
                    db.createObjectStore('models', { keyPath: 'url' });
                }
                if (!db.objectStoreNames.contains('api')) {
                    db.createObjectStore('api', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('textures')) {
                    db.createObjectStore('textures', { keyPath: 'url' });
                }
            };
        });
    }

    /**
     * Ensure IndexedDB is ready
     */
    private async ensureDB(): Promise<void> {
        if (this.dbInitPromise) {
            await this.dbInitPromise;
        }
    }

    /**
     * Check if cache is valid based on TTL and version
     */
    private isCacheValid<T>(item: CacheItem<T>, ttl: number, version: string): boolean {
        const now = Date.now();
        const isExpired = (now - item.timestamp) > ttl;
        const isVersionMatch = item.version === version;

        return !isExpired && isVersionMatch;
    }

    /**
     * Cache a 3D model file (as ArrayBuffer)
     */
    async cacheModel(url: string, data: ArrayBuffer, options: CacheOptions = {}): Promise<void> {
        const { version = CACHE_VERSION } = options;

        // Memory cache
        this.memoryCache.set(`model:${url}`, data);

        // Wait for IndexedDB to be ready
        await this.ensureDB();

        // IndexedDB cache
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['models'], 'readwrite');
            const store = transaction.objectStore('models');

            const cacheItem: CacheItem<ArrayBuffer> = {
                data,
                timestamp: Date.now(),
                version,
            };

            await store.put({ url, ...cacheItem });
            console.log(`Cached model: ${url}`);
        } catch (error) {
            console.error('Failed to cache model:', error);
        }
    }

    /**
     * Get cached 3D model
     */
    async getCachedModel(url: string, options: CacheOptions = {}): Promise<ArrayBuffer | null> {
        const { ttl = DEFAULT_TTL, version = CACHE_VERSION, forceRefresh = false } = options;

        if (forceRefresh) return null;

        // Check memory cache first
        const memCached = this.memoryCache.get(`model:${url}`);
        if (memCached) {
            console.log(`Model found in memory cache: ${url}`);
            return memCached;
        }

        // Wait for IndexedDB to be ready
        await this.ensureDB();

        // Check IndexedDB
        if (!this.db) {
            console.warn('IndexedDB not available, cannot retrieve cached model');
            return null;
        }

        try {
            const transaction = this.db.transaction(['models'], 'readonly');
            const store = transaction.objectStore('models');
            const request = store.get(url);

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && this.isCacheValid(result, ttl, version)) {
                        console.log(`Model found in IndexedDB cache: ${url}`);
                        // Store in memory cache for faster subsequent access
                        this.memoryCache.set(`model:${url}`, result.data);
                        resolve(result.data);
                    } else {
                        if (result) {
                            console.log(`Cached model expired: ${url}`);
                        } else {
                            console.log(`Model not in cache: ${url}`);
                        }
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('Failed to get cached model:', request.error);
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('Failed to retrieve cached model:', error);
            return null;
        }
    }

    /**
     * Cache API response
     */
    async cacheAPIResponse<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
        const { version = CACHE_VERSION } = options;

        // Memory cache
        this.memoryCache.set(`api:${key}`, data);

        // LocalStorage fallback for API responses (smaller data)
        try {
            const cacheItem: CacheItem<T> = {
                data,
                timestamp: Date.now(),
                version,
            };
            localStorage.setItem(`api:${key}`, JSON.stringify(cacheItem));
            console.log(`Cached API response: ${key}`);
        } catch (error) {
            console.error('Failed to cache API response to localStorage:', error);
        }

        // Also store in IndexedDB for larger responses
        await this.ensureDB();
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['api'], 'readwrite');
            const store = transaction.objectStore('api');

            const cacheItem: CacheItem<T> = {
                data,
                timestamp: Date.now(),
                version,
            };

            await store.put({ key, ...cacheItem });
        } catch (error) {
            console.error('Failed to cache API response to IndexedDB:', error);
        }
    }

    /**
     * Get cached API response
     */
    async getCachedAPIResponse<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
        const { ttl = DEFAULT_TTL, version = CACHE_VERSION, forceRefresh = false } = options;

        if (forceRefresh) return null;

        // Check memory cache first
        const memCached = this.memoryCache.get(`api:${key}`);
        if (memCached) {
            console.log(`API response found in memory cache: ${key}`);
            return memCached;
        }

        // Check localStorage
        try {
            const cached = localStorage.getItem(`api:${key}`);
            if (cached) {
                const item: CacheItem<T> = JSON.parse(cached);
                if (this.isCacheValid(item, ttl, version)) {
                    console.log(`API response found in localStorage: ${key}`);
                    this.memoryCache.set(`api:${key}`, item.data);
                    return item.data;
                }
            }
        } catch (error) {
            console.error('Failed to get cached API response from localStorage:', error);
        }

        // Check IndexedDB
        await this.ensureDB();
        if (!this.db) return null;

        try {
            const transaction = this.db.transaction(['api'], 'readonly');
            const store = transaction.objectStore('api');
            const request = store.get(key);

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && this.isCacheValid(result, ttl, version)) {
                        console.log(`API response found in IndexedDB: ${key}`);
                        this.memoryCache.set(`api:${key}`, result.data);
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('Failed to get cached API response:', request.error);
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('Failed to retrieve cached API response:', error);
            return null;
        }
    }

    /**
     * Cache texture/image as blob
     */
    async cacheTexture(url: string, blob: Blob, options: CacheOptions = {}): Promise<void> {
        const { version = CACHE_VERSION } = options;

        await this.ensureDB();
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['textures'], 'readwrite');
            const store = transaction.objectStore('textures');

            const cacheItem = {
                url,
                data: blob,
                timestamp: Date.now(),
                version,
            };

            await store.put(cacheItem);
            console.log(`Cached texture: ${url}`);
        } catch (error) {
            console.error('Failed to cache texture:', error);
        }
    }

    /**
     * Get cached texture
     */
    async getCachedTexture(url: string, options: CacheOptions = {}): Promise<Blob | null> {
        const { ttl = DEFAULT_TTL, version = CACHE_VERSION, forceRefresh = false } = options;

        if (forceRefresh) return null;

        await this.ensureDB();
        if (!this.db) return null;

        try {
            const transaction = this.db.transaction(['textures'], 'readonly');
            const store = transaction.objectStore('textures');
            const request = store.get(url);

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && this.isCacheValid(result, ttl, version)) {
                        console.log(`Texture found in cache: ${url}`);
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('Failed to get cached texture:', request.error);
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('Failed to retrieve cached texture:', error);
            return null;
        }
    }

    /**
     * Clear cache for a specific type
     */
    async clearCache(type: 'models' | 'api' | 'textures' | 'all' = 'all'): Promise<void> {
        // Clear memory cache
        if (type === 'all') {
            this.memoryCache.clear();
        } else {
            const prefix = type === 'models' ? 'model:' : type === 'api' ? 'api:' : '';
            for (const key of this.memoryCache.keys()) {
                if (key.startsWith(prefix)) {
                    this.memoryCache.delete(key);
                }
            }
        }

        // Clear localStorage for API
        if (type === 'api' || type === 'all') {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('api:')) {
                    localStorage.removeItem(key);
                }
            }
        }

        // Clear IndexedDB
        await this.ensureDB();
        if (!this.db) return;

        const stores = type === 'all' ? ['models', 'api', 'textures'] : [type];

        for (const storeName of stores) {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                await store.clear();
                console.log(`Cleared ${storeName} cache`);
            } catch (error) {
                console.error(`Failed to clear ${storeName} cache:`, error);
            }
        }
    }

    /**
     * Get cache size estimation
     */
    async getCacheSize(): Promise<{ models: number; api: number; textures: number }> {
        if (!this.db) return { models: 0, api: 0, textures: 0 };

        const sizes = { models: 0, api: 0, textures: 0 };

        try {
            for (const storeName of ['models', 'api', 'textures'] as const) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.count();

                sizes[storeName] = await new Promise((resolve) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve(0);
                });
            }
        } catch (error) {
            console.error('Failed to get cache size:', error);
        }

        return sizes;
    }
}

// Export singleton instance
export const cacheManager = new CacheManager();
