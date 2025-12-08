import { cacheManager } from './cacheManager';

// API Configuration
// In production (static export), call backend directly
// In development, you can use /api proxy or direct backend call
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://threedmockupbackend.onrender.com/api';

// Cache TTL (Time To Live) - 1 hour for API responses
const API_CACHE_TTL = 60 * 60 * 1000;

// Types matching the API response
export interface APICategory {
    _id: string;
    name: string;
    slug: string;
}

export interface APIUploadedBy {
    _id: string;
    name: string;
    email: string;
}

export interface ModelConfig {
    targetSize?: number;
    groundOffset?: number;
    xOffset?: number;
    yOffset?: number;
    zOffset?: number;
}

export interface APIModel {
    _id: string;
    name: string;
    description: string;
    category: APICategory;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    thumbnailUrl: string;
    uvMapUrl: string | null;
    textureUrls: string[];
    tags: string[];
    isPremium: boolean;
    isActive: boolean;
    visibility: string;
    uploadedBy: APIUploadedBy;
    downloadCount: number;
    viewCount: number;
    version: number;
    versions: any[];
    createdAt: string;
    updatedAt: string;
    __v: number;
    modelConfig?: ModelConfig;
}

export interface APIPagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface ModelsAPIResponse {
    status: string;
    data: {
        models: APIModel[];
        pagination: APIPagination;
    };
}

/**
 * Fetch all models from the API with caching support
 * @param page - Page number (default: 1)
 * @param limit - Number of models per page (default: 20)
 * @param forceRefresh - Force refresh from API (default: false)
 * @returns Promise with models data
 */
export async function fetchModels(
    page: number = 1,
    limit: number = 20,
    forceRefresh: boolean = false
): Promise<ModelsAPIResponse> {
    const cacheKey = `models-page${page}-limit${limit}`;

    try {
        // Check cache first
        if (!forceRefresh) {
            const cached = await cacheManager.getCachedAPIResponse<ModelsAPIResponse>(
                cacheKey,
                { ttl: API_CACHE_TTL }
            );

            if (cached) {
                console.log('Models loaded from cache');
                return cached;
            }
        }

        // Fetch from API
        const url = `${API_BASE_URL}/models?page=${page}&limit=${limit}`;
        console.log('Fetching models from API:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            mode: 'cors', // Explicitly enable CORS
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data: ModelsAPIResponse = await response.json();
        console.log('Models fetched successfully:', data.data.models.length, 'models');

        // Cache the response
        await cacheManager.cacheAPIResponse(cacheKey, data);

        return data;
    } catch (error) {
        console.error('Failed to fetch models:', error);

        // Try to return stale cache as fallback
        const staleCache = await cacheManager.getCachedAPIResponse<ModelsAPIResponse>(
            cacheKey,
            { ttl: Infinity } // Accept any cached data as fallback
        );

        if (staleCache) {
            console.warn('API failed, returning stale cache');
            return staleCache;
        }

        if (error instanceof Error) {
            throw new Error(`Failed to fetch models: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Fetch a single model by ID with caching
 * @param modelId - The model ID
 * @param forceRefresh - Force refresh from API (default: false)
 * @returns Promise with model data
 */
export async function fetchModelById(modelId: string, forceRefresh: boolean = false): Promise<APIModel> {
    const cacheKey = `model-${modelId}`;

    try {
        // Check cache first
        if (!forceRefresh) {
            const cached = await cacheManager.getCachedAPIResponse<APIModel>(
                cacheKey,
                { ttl: API_CACHE_TTL }
            );

            if (cached) {
                console.log(`Model ${modelId} loaded from cache`);
                return cached;
            }
        }

        // Fetch from API
        const url = `${API_BASE_URL}/models/${modelId}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const model = data.data.model;

        // Cache the response
        await cacheManager.cacheAPIResponse(cacheKey, model);

        return model;
    } catch (error) {
        console.error(`Failed to fetch model ${modelId}:`, error);

        // Try to return stale cache as fallback
        const staleCache = await cacheManager.getCachedAPIResponse<APIModel>(
            cacheKey,
            { ttl: Infinity }
        );

        if (staleCache) {
            console.warn('API failed, returning stale cache for model');
            return staleCache;
        }

        throw error;
    }
}

/**
 * Fetch all categories with caching
 * @param forceRefresh - Force refresh from API (default: false)
 * @returns Promise with categories data
 */
export async function fetchCategories(forceRefresh: boolean = false): Promise<APICategory[]> {
    const cacheKey = 'categories';

    try {
        // Check cache first
        if (!forceRefresh) {
            const cached = await cacheManager.getCachedAPIResponse<APICategory[]>(
                cacheKey,
                { ttl: API_CACHE_TTL }
            );

            if (cached) {
                console.log('Categories loaded from cache');
                return cached;
            }
        }

        // Fetch from API
        const url = `${API_BASE_URL}/categories`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const categories = data.data.categories;

        // Cache the response
        await cacheManager.cacheAPIResponse(cacheKey, categories);

        return categories;
    } catch (error) {
        console.error('Failed to fetch categories:', error);

        // Try to return stale cache as fallback
        const staleCache = await cacheManager.getCachedAPIResponse<APICategory[]>(
            cacheKey,
            { ttl: Infinity }
        );

        if (staleCache) {
            console.warn('API failed, returning stale cache for categories');
            return staleCache;
        }

        throw error;
    }
}

/**
 * Clear all API cache
 */
export async function clearAPICache(): Promise<void> {
    await cacheManager.clearCache('api');
    console.log('API cache cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
    return await cacheManager.getCacheSize();
}
