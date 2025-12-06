// API Configuration
// Using local Next.js API route as a proxy to avoid CORS issues
const API_BASE_URL = '/api';

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
 * Fetch all models from the API
 * @param page - Page number (default: 1)
 * @param limit - Number of models per page (default: 20)
 * @returns Promise with models data
 */
export async function fetchModels(page: number = 1, limit: number = 20): Promise<ModelsAPIResponse> {
    try {
        const url = `${API_BASE_URL}/models?page=${page}&limit=${limit}`;
        console.log('Fetching models from:', url);

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
        return data;
    } catch (error) {
        console.error('Failed to fetch models:', error);
        if (error instanceof Error) {
            throw new Error(`Failed to fetch models: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Fetch a single model by ID
 * @param modelId - The model ID
 * @returns Promise with model data
 */
export async function fetchModelById(modelId: string): Promise<APIModel> {
    try {
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
        return data.data.model;
    } catch (error) {
        console.error(`Failed to fetch model ${modelId}:`, error);
        throw error;
    }
}

/**
 * Fetch all categories
 * @returns Promise with categories data
 */
export async function fetchCategories(): Promise<APICategory[]> {
    try {
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
        return data.data.categories;
    } catch (error) {
        console.error('Failed to fetch categories:', error);
        throw error;
    }
}
