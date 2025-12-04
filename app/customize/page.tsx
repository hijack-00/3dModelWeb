'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { HexColorPicker } from 'react-colorful';
import Link from 'next/link';

// Dynamically import Scene3D to avoid SSR issues
const Scene3D = dynamic(() => import('@/components/Scene3D'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-[#212121]">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#B0A3F0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white text-lg">Loading 3D Scene...</p>
            </div>
        </div>
    ),
});

type ToolType = 'color' | 'edit' | 'background' | 'rotate' | 'hdr' | 'view' | null;

function CustomizeContent() {
    const searchParams = useSearchParams();
    const modelParam = searchParams.get('model');

    const [modelPath, setModelPath] = useState(modelParam || '/models/Tshirt_Oversized.glb');
    const [modelColor, setModelColor] = useState('#FFFFFF');
    const [decalImage, setDecalImage] = useState<string | null>(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [activeTool, setActiveTool] = useState<ToolType>(null);
    const [autoRotate, setAutoRotate] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle image upload for decal
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setDecalImage(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Take screenshot
    const handleScreenshot = () => {
        if (canvasRef.current) {
            const canvas = canvasRef.current.querySelector('canvas');
            if (canvas) {
                const link = document.createElement('a');
                link.download = `3d-mockup-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }
        }
    };

    // Save project
    const handleSaveProject = () => {
        const projectData = {
            modelPath,
            modelColor,
            decalImage,
            timestamp: Date.now(),
        };
        localStorage.setItem('3d-mockup-project', JSON.stringify(projectData));
        alert('Project saved!');
    };

    return (
        <div className="relative h-screen w-screen overflow-hidden font-sans">
            {/* Back Button */}
            <Link
                href="/"
                className="absolute top-5 left-5 z-50 px-4 py-2 bg-slate-800/90 text-white rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Gallery
            </Link>

            {/* 3D Canvas */}
            <div ref={canvasRef} className="w-full h-full" style={{ pointerEvents: 'auto', touchAction: 'none' }}>
                <Scene3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    decalImage={decalImage}
                    onModelLoad={() => setIsModelLoaded(true)}
                />
            </div>

            {/* Top Right Action Buttons */}
            <div className="absolute top-5 right-5 flex gap-3 z-50">
                <button
                    onClick={handleSaveProject}
                    title="Save project"
                    className="p-3.5 bg-[#B0A3F0] text-white rounded-xl cursor-pointer flex items-center justify-center transition-all hover:-translate-y-0.5"
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="20" width="20">
                        <path d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM224 416c-35.346 0-64-28.654-64-64 0-35.346 28.654-64 64-64s64 28.654 64 64c0 35.346-28.654 64-64 64zm96-304.52V212c0 6.627-5.373 12-12 12H76c-6.627 0-12-5.373-12-12V108c0-6.627 5.373-12 12-12h228.52c3.183 0 6.235 1.264 8.485 3.515l3.48 3.48A11.996 11.996 0 0 1 320 111.48z"></path>
                    </svg>
                </button>

                <button
                    onClick={handleScreenshot}
                    title="Take screenshot"
                    className="p-3.5 bg-[rgba(34,34,34,0.5)] text-white rounded-xl cursor-pointer flex items-center justify-center transition-all hover:-translate-y-0.5"
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20">
                        <path d="M512 144v288c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V144c0-26.5 21.5-48 48-48h88l12.3-32.9c7-18.7 24.9-31.1 44.9-31.1h125.5c20 0 37.9 12.4 44.9 31.1L376 96h88c26.5 0 48 21.5 48 48zM376 288c0-66.2-53.8-120-120-120s-120 53.8-120 120 53.8 120 120 120 120-53.8 120-120zm-32 0c0 48.5-39.5 88-88 88s-88-39.5-88-88 39.5-88 88-88 88 39.5 88 88z"></path>
                    </svg>
                </button>
            </div>

            {/* Bottom Toolbar */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#222222] backdrop-blur-[20px] p-5 flex justify-center items-center gap-2.5 overflow-x-auto z-20">
                {/* Color Button */}
                <button
                    onClick={() => setActiveTool(activeTool === 'color' ? null : 'color')}
                    className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${activeTool === 'color' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
                        }`}
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
                        <path d="M167.02 309.34c-40.12 2.58-76.53 17.86-97.19 72.3-2.35 6.21-8 9.98-14.59 9.98-11.11 0-45.46-27.67-55.25-34.35C0 439.62 37.93 512 128 512c75.86 0 128-43.77 128-120.19 0-3.11-.65-6.08-.97-9.13l-88.01-73.34zM457.89 0c-15.16 0-29.37 6.71-40.21 16.45C213.27 199.05 192 203.34 192 257.09c0 13.7 3.25 26.76 8.73 38.7l63.82 53.18c7.21 1.8 14.64 3.03 22.39 3.03 62.11 0 98.11-45.47 211.16-256.46 7.38-14.35 13.9-29.85 13.9-45.99C512 20.64 486 0 457.89 0z"></path>
                    </svg>
                    Color
                </button>

                {/* Edit Button */}
                <button
                    onClick={() => setActiveTool(activeTool === 'edit' ? null : 'edit')}
                    className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${activeTool === 'edit' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
                        }`}
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
                        <path d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48zM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56zM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48z"></path>
                    </svg>
                    Edit
                </button>

                {/* Background Button */}
                <button
                    onClick={() => setActiveTool(activeTool === 'background' ? null : 'background')}
                    className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[90px] transition-all backdrop-blur-[10px] ${activeTool === 'background' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
                        }`}
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
                        <path d="M204.3 5C104.9 24.4 24.8 104.3 5.2 203.4c-37 187 131.7 326.4 258.8 306.7 41.2-6.4 61.4-54.6 42.5-91.7-23.1-45.4 9.9-98.4 60.9-98.4h79.7c35.8 0 64.8-29.6 64.9-65.3C511.5 97.1 368.1-26.9 204.3 5zM96 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm32-128c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128-64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z"></path>
                    </svg>
                    Background
                </button>

                {/* Rotate Button */}
                <button
                    onClick={() => {
                        setAutoRotate(!autoRotate);
                        setActiveTool('rotate');
                    }}
                    className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${autoRotate ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
                        }`}
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
                        <path d="M370.72 133.28C339.458 104.008 298.888 87.962 255.848 88c-77.458.068-144.328 53.178-162.791 126.85-1.344 5.363-6.122 9.15-11.651 9.15H24.103c-7.498 0-13.194-6.807-11.807-14.176C33.933 94.924 134.813 8 256 8c66.448 0 126.791 26.136 171.315 68.685L463.03 40.97C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.749zM32 296h134.059c21.382 0 32.09 25.851 16.971 40.971l-41.75 41.75c31.262 29.273 71.835 45.319 114.876 45.28 77.418-.07 144.315-53.144 162.787-126.849 1.344-5.363 6.122-9.15 11.651-9.15h57.304c7.498 0 13.194 6.807 11.807 14.176C478.067 417.076 377.187 504 256 504c-66.448 0-126.791-26.136-171.315-68.685L48.97 471.03C33.851 486.149 8 475.441 8 454.059V320c0-13.255 10.745-24 24-24z"></path>
                    </svg>
                    Rotate
                </button>

                {/* HDR Button */}
                <button
                    onClick={() => setActiveTool(activeTool === 'hdr' ? null : 'hdr')}
                    className="flex flex-col items-center py-4 px-5 text-[13px] font-medium bg-white/5 text-[#b0b0b0] rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px]"
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 496 512" height="20" width="20" className="mb-2">
                        <path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"></path>
                    </svg>
                    HDR
                </button>

                {/* View Button */}
                <button
                    onClick={() => setActiveTool(activeTool === 'view' ? null : 'view')}
                    className="flex flex-col items-center py-4 px-5 text-[13px] font-medium bg-white/5 text-[#b0b0b0] rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px]"
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 640 512" height="20" width="20" className="mb-2">
                        <path d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"></path>
                    </svg>
                    View
                </button>
            </div>

            {/* Color Picker Panel */}
            {activeTool === 'color' && (
                <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-2.5 rounded-[10px] border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.2)] z-40 flex gap-2.5">
                    <div className="flex-shrink-0 w-[150px]">
                        <HexColorPicker color={modelColor} onChange={setModelColor} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div className="grid grid-cols-2 gap-1 w-[120px]">
                            <button className="px-2 py-2 bg-[#B0A3F0] text-white border border-[#B0A3F0] rounded-[5px] text-[10px] font-semibold">
                                All
                            </button>
                            <button className="px-2 py-2 bg-white/8 text-white border border-white/15 rounded-[5px] text-[10px] font-semibold">
                                Body
                            </button>
                        </div>
                        <div className="px-2 py-1.5 bg-white/8 rounded-[5px] flex items-center gap-1.5 border border-white/10 w-[120px]">
                            <div className="w-4 h-4 rounded-[3px] border-[1.5px] border-white/40" style={{ background: modelColor }}></div>
                            <span className="text-white text-[9px] font-mono font-semibold flex-1 overflow-hidden text-ellipsis">{modelColor}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Panel - Image Upload */}
            {activeTool === 'edit' && (
                <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-4 rounded-2xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] z-40">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-gradient-to-r from-[#B0A3F0] to-[#B0A3F0] text-white rounded-lg transition-all hover:shadow-lg"
                    >
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="12" width="12">
                            <path d="M296 384h-80c-13.3 0-24-10.7-24-24V192h-87.7c-17.8 0-26.7-21.5-14.1-34.1L242.3 5.7c7.5-7.5 19.8-7.5 27.3 0l152.2 152.2c12.6 12.6 3.7 34.1-14.1 34.1H320v168c0 13.3-10.7 24-24 24zm216-8v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h136v8c0 30.9 25.1 56 56 56h80c30.9 0 56-25.1 56-56v-8h136c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"></path>
                        </svg>
                        Upload Design
                    </button>
                    <p className="text-white/60 text-[11px] mt-2 text-center">PNG or JPG (Max 10MB)</p>
                </div>
            )}
        </div>
    );
}

export default function CustomizePage() {
    return (
        <Suspense fallback={
            <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
                <div className="text-white text-lg">Loading...</div>
            </div>
        }>
            <CustomizeContent />
        </Suspense>
    );
}
