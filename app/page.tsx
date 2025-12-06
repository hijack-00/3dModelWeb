'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchModels, APIModel } from '@/lib/api';
import Image from 'next/image';

export default function Home() {
    const router = useRouter();
    const [models, setModels] = useState<APIModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadModels();
    }, []);

    const loadModels = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetchModels(1, 50); // Fetch first 50 models
            if (response.status === 'success' && response.data.models) {
                setModels(response.data.models);
            }
        } catch (err) {
            setError('Failed to load models. Please try again later.');
            console.error('Error loading models:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleModelClick = (model: APIModel) => {
        // Navigate to customize page with model file URL and config
        const modelConfigParam = model.modelConfig
            ? `&modelConfig=${encodeURIComponent(JSON.stringify(model.modelConfig))}`
            : '';
        router.push(`/customize?modelUrl=${encodeURIComponent(model.fileUrl)}&modelId=${model._id}&modelName=${encodeURIComponent(model.name)}${modelConfigParam}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Header */}
            <header className="border-b border-slate-800/50 backdrop-blur-xl bg-slate-900/50">
                <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                        Free 3D Mockups
                    </h1>
                    <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">Select a model to customize</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center min-h-[400px]">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                        <p className="text-slate-400 text-lg">Loading models from API...</p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="flex flex-col items-center justify-center min-h-[400px]">
                        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 max-w-md">
                            <h3 className="text-red-400 text-xl font-bold mb-2">Error Loading Models</h3>
                            <p className="text-red-300 mb-4">{error}</p>
                            <button
                                onClick={loadModels}
                                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {/* Models Grid */}
                {!loading && !error && models.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 max-w-6xl mx-auto">
                        {models.map((model) => (
                            <div
                                key={model._id}
                                onClick={() => handleModelClick(model)}
                                className="group relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 border border-slate-700/50 backdrop-blur-xl"
                            >
                                {/* Thumbnail Image */}
                                <div className="relative w-full aspect-square bg-slate-800/50">
                                    {model.thumbnailUrl ? (
                                        <img
                                            src={model.thumbnailUrl}
                                            alt={model.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-6xl">
                                            🎨
                                        </div>
                                    )}

                                    {/* Premium Badge */}
                                    {model.isPremium && (
                                        <div className="absolute top-2 right-2 bg-yellow-500/90 text-yellow-900 px-2 py-1 rounded-lg text-xs font-bold">
                                            PREMIUM
                                        </div>
                                    )}

                                    {/* Category Badge */}
                                    <div className="absolute bottom-2 left-2 bg-purple-500/90 text-white px-2 py-1 rounded-lg text-xs font-medium">
                                        {model.category.name}
                                    </div>
                                </div>

                                {/* Card Content */}
                                <div className="p-4 sm:p-6">
                                    {/* Title */}
                                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-500 group-hover:bg-clip-text transition-all">
                                        {model.name}
                                    </h3>

                                    {/* Description */}
                                    <p className="text-slate-400 text-sm mb-3 line-clamp-2">
                                        {model.description}
                                    </p>

                                    {/* Stats */}
                                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                                        <span className="flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            {model.viewCount}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            {model.downloadCount}
                                        </span>
                                    </div>

                                    {/* Click to Customize Badge */}
                                    <div className="flex items-center justify-center gap-2 text-slate-300 group-hover:text-white transition-colors">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <span className="text-xs sm:text-sm font-medium">Click to Customize</span>
                                    </div>
                                </div>

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                                {/* Animated Border */}
                                <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity -z-10 blur-xl"></div>
                            </div>
                        ))}
                    </div>
                )}

                {/* No Models State */}
                {!loading && !error && models.length === 0 && (
                    <div className="flex flex-col items-center justify-center min-h-[400px]">
                        <p className="text-slate-400 text-lg mb-4">No models found</p>
                        <button
                            onClick={loadModels}
                            className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all"
                        >
                            Refresh
                        </button>
                    </div>
                )}

                {/* Footer Info */}
                {!loading && !error && models.length > 0 && (
                    <div className="mt-12 sm:mt-16 text-center">
                        <p className="text-slate-500 text-xs sm:text-sm">
                            Found {models.length} model{models.length !== 1 ? 's' : ''} from API
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

