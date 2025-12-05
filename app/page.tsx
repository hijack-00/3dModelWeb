'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ModelCard {
    name: string;
    fileName: string;
    path: string;
    icon: string;
}

export default function Home() {
    const router = useRouter();
    const [models, setModels] = useState<ModelCard[]>([]);

    useEffect(() => {
        // For testing: showing only Female Hoodie model with proper material maps
        const availableModels: ModelCard[] = [
            {
                name: 'Female Hoodie',
                fileName: 'female_cloth1.glb',
                path: '/models/FemaleHoodie/female_cloth1.glb',
                icon: '🧥'
            },
            {
                name: 'Oversized Tshirt',
                fileName: 'Tshirt_Oversized.glb',
                path: '/models/Tshirt_Oversized.glb',
                icon: '👔' // Pick an emoji
            },
            {
                name: 'Oversized Tshirt 2',
                fileName: 'Tshirt_Oversized.glb',
                path: '/models/Tshirt_Oversized.glb',
                icon: '👔' // Pick an emoji
            }

        ];
        setModels(availableModels);
    }, []);

    const handleModelClick = (modelPath: string) => {
        // Navigate to customize page with model parameter
        router.push(`/customize?model=${encodeURIComponent(modelPath)}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Header */}
            <header className="border-b border-slate-800/50 backdrop-blur-xl bg-slate-900/50">
                <div className="container mx-auto px-6 py-6">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                        Free 3D Mockups
                    </h1>
                    <p className="text-slate-400 mt-2">Select a model to customize</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {models.map((model, index) => (
                        <div
                            key={index}
                            onClick={() => handleModelClick(model.path)}
                            className="group relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 border border-slate-700/50 backdrop-blur-xl"
                        >
                            {/* Card Content */}
                            <div className="p-8">
                                {/* Icon */}
                                <div className="text-7xl mb-4 text-center transform group-hover:scale-110 transition-transform">
                                    {model.icon}
                                </div>

                                {/* Title */}
                                <h3 className="text-2xl font-bold text-white text-center mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-500 group-hover:bg-clip-text transition-all">
                                    {model.name}
                                </h3>

                                {/* File Name */}
                                <p className="text-slate-400 text-sm text-center font-mono">
                                    {model.fileName}
                                </p>

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                                {/* Click to Customize Badge */}
                                <div className="mt-6 flex items-center justify-center gap-2 text-slate-300 group-hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span className="text-sm font-medium">Click to Customize</span>
                                </div>
                            </div>

                            {/* Animated Border */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity -z-10 blur-xl"></div>
                        </div>
                    ))}
                </div>

                {/* Footer Info */}
                <div className="mt-16 text-center">
                    <p className="text-slate-500 text-sm">
                        Found {models.length} model{models.length !== 1 ? 's' : ''} in public/models
                    </p>
                </div>
            </main>
        </div>
    );
}
