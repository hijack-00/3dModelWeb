'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { HexColorPicker } from 'react-colorful';
import Link from 'next/link';

const Scene3D = dynamic(() => import('@/components/Scene3D'), { ssr: false });

type ToolType = 'color' | 'edit' | 'background' | 'rotate' | 'hdr' | 'view' | 'decal' | null;

interface Sticker {
    id: string;
    src: string;
    uvX: number; // 0..1
    uvY: number; // 0..1 (1 = top)
    scale: number; // 0.05..0.5
    width: number; // px in editor
    height: number; // px in editor
    rotation: number; // deg
    aspectRatio: number; // w/h
    zIndex: number;
    crop?: { x: number; y: number; width: number; height: number }; // percents
}

interface StickerForScene {
    src: string;
    uvX: number;
    uvY: number;
    scale: number;
    rotation?: number;
    aspectRatio?: number;
}

const DEFAULT_FRAME_SIZE_PX = 360;

function genId() {
    return Math.random().toString(36).slice(2, 9);
}

function CustomizeContent(): JSX.Element {
    const searchParams = useSearchParams();
    const modelParam = searchParams.get('model');

    const [modelPath] = useState<string>(modelParam || '/models/FemaleHoodie/female_cloth1.glb');
    const [modelColor, setModelColor] = useState<string>('original');

    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const [activeTool, setActiveTool] = useState<ToolType>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const thumbnailRef = useRef<HTMLImageElement | null>(null);

    // Interaction states
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);

    const [isResizing, setIsResizing] = useState(false);
    const resizeStateRef = useRef<{ id: string; x: number; y: number; width: number; height: number } | null>(null);

    const [isRotating, setIsRotating] = useState(false);
    const rotateStateRef = useRef<{ index: number; startAngle: number; pointerAngle: number } | null>(null);

    const [isCropping, setIsCropping] = useState(false);
    const cropStateRef = useRef<{
        handle: null | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
        startX: number;
        startY: number;
        crop: { x: number; y: number; width: number; height: number };
    } | null>(null);

    // add sticker helper
    const addStickerFromDataUrl = (dataUrl: string) => {
        const img = new Image();
        img.onload = () => {
            const aspect = img.width && img.height ? img.width / img.height : 1;
            const sizePx = 100;
            const newSticker: Sticker = {
                id: genId(),
                src: dataUrl,
                uvX: 0.5,
                uvY: 0.5,
                scale: 0.15,
                width: sizePx,
                height: Math.round(sizePx / aspect),
                rotation: 0,
                aspectRatio: aspect,
                zIndex: stickers.length,
                crop: { x: 0, y: 0, width: 100, height: 100 },
            };
            setStickers(prev => {
                const next = [...prev, newSticker];
                setSelectedIndex(next.length - 1);
                return next;
            });
        };
        img.onerror = () => {
            console.warn('Failed to read uploaded image');
        };
        img.src = dataUrl;
    };

    // image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = evt => {
                const data = evt.target?.result;
                if (typeof data === 'string') addStickerFromDataUrl(data);
            };
            reader.readAsDataURL(file);
        });
    };

    // Global mouse handlers to support drag/resize/rotate across document
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const frame = frameRef.current;
            if (!frame) return;
            const rect = frame.getBoundingClientRect();


            // Dragging
            if (isDragging && dragStartRef.current && selectedIndex !== null) {
                // Capture ref values before async setState to prevent race conditions
                const dragStart = dragStartRef.current;

                setStickers(prev => {
                    const s = prev[selectedIndex];
                    if (!s || !dragStart) return prev;
                    const dx = e.clientX - dragStart.x;
                    const dy = e.clientY - dragStart.y;
                    const centerX = s.uvX * rect.width;
                    const centerY = (1 - s.uvY) * rect.height;
                    let newCenterX = centerX + dx;
                    let newCenterY = centerY + dy;
                    newCenterX = Math.max(0, Math.min(rect.width, newCenterX));
                    newCenterY = Math.max(0, Math.min(rect.height, newCenterY));
                    const uvX = newCenterX / rect.width;
                    const uvY = 1 - newCenterY / rect.height;

                    const copy = [...prev];
                    copy[selectedIndex] = { ...copy[selectedIndex], uvX, uvY };
                    return copy;
                });

                dragStartRef.current = { x: e.clientX, y: e.clientY };
                return;
            }

            // Resizing
            if (isResizing && resizeStateRef.current) {
                const rs = resizeStateRef.current;
                const dx = e.clientX - rs.x;
                const dy = e.clientY - rs.y;
                const delta = Math.max(dx, dy);
                setStickers(prev => prev.map(s => {
                    if (s.id !== rs.id) return s;
                    const newW = Math.max(24, Math.round(rs.width + delta));
                    const newH = Math.max(24, Math.round(rs.height + delta / s.aspectRatio));
                    // Map to "scale" relative to frame
                    const biggest = Math.max(rect.width, rect.height);
                    const relative = Math.min(0.5, Math.max(0.05, newW / biggest));
                    return { ...s, width: newW, height: newH, scale: relative };
                }));
                return;
            }

            // Rotating via handle
            if (isRotating && rotateStateRef.current) {
                const st = rotateStateRef.current;
                setStickers(prev => {
                    const s = prev[st.index];
                    if (!s) return prev;
                    const centerX = s.uvX * rect.width + rect.left;
                    const centerY = (1 - s.uvY) * rect.height + rect.top;
                    const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                    const angleDeg = angleRad * (180 / Math.PI);
                    const delta = angleDeg - st.pointerAngle;
                    const newRotation = (st.startAngle + delta) % 360;
                    return prev.map((x, i) => i === st.index ? { ...x, rotation: newRotation } : x);
                });
                return;
            }

            // Crop live handled separately (via crop state)
        };

        const onUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
            setIsResizing(false);
            resizeStateRef.current = null;
            setIsRotating(false);
            rotateStateRef.current = null;
            setIsCropping(false);
            cropStateRef.current = null;
        };

        if (isDragging || isResizing || isRotating) {
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        }

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isDragging, isResizing, isRotating, selectedIndex]);

    // start dragging
    const startDragSticker = (e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        setSelectedIndex(idx);
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    // start resize
    const startResize = (e: React.MouseEvent, stickerId: string) => {
        e.stopPropagation();
        const s = stickers.find(x => x.id === stickerId);
        if (!s) return;
        setIsResizing(true);
        resizeStateRef.current = { id: stickerId, x: e.clientX, y: e.clientY, width: s.width, height: s.height };
    };

    // start rotate handle
    const startRotateHandle = (e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        const frame = frameRef.current;
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const s = stickers[idx];
        const centerX = s.uvX * rect.width + rect.left;
        const centerY = (1 - s.uvY) * rect.height + rect.top;
        const pointerAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const pointerAngleDeg = pointerAngleRad * (180 / Math.PI);
        rotateStateRef.current = { index: idx, startAngle: s.rotation || 0, pointerAngle: pointerAngleDeg };
        setIsRotating(true);
        setSelectedIndex(idx);
    };

    // rotate selected by button
    const rotateSelectedBy = (deg: number) => {
        if (selectedIndex === null) return;
        setStickers(prev => prev.map((s, i) => i === selectedIndex ? { ...s, rotation: (s.rotation + deg) % 360 } : s));
    };

    // delete selected
    const deleteSelected = () => {
        if (selectedIndex === null) return;
        const idToRemove = stickers[selectedIndex].id;
        setStickers(prev => prev.filter(s => s.id !== idToRemove).map((s, i) => ({ ...s, zIndex: i })));
        setSelectedIndex(null);
    };

    // bring forward / send backward
    const bringForward = () => {
        if (selectedIndex === null) return;
        setStickers(prev => {
            const copy = [...prev];
            const [item] = copy.splice(selectedIndex, 1);
            copy.push(item);
            return copy.map((s, i) => ({ ...s, zIndex: i }));
        });
        setSelectedIndex(prev => {
            // The selected item is now at the end
            return (prev !== null && stickers.length > 0) ? stickers.length - 1 : null;
        });
    };
    const sendBackward = () => {
        if (selectedIndex === null) return;
        setStickers(prev => {
            const copy = [...prev];
            const [item] = copy.splice(selectedIndex, 1);
            copy.unshift(item);
            return copy.map((s, i) => ({ ...s, zIndex: i }));
        });
        setSelectedIndex(0);
    };

    // crop start on thumbnail
    const handleCropMouseDown = (e: React.MouseEvent, handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null) => {
        e.stopPropagation();
        if (selectedIndex === null) return;
        const s = stickers[selectedIndex];
        if (!s) return;
        setIsCropping(true);
        cropStateRef.current = {
            handle,
            startX: e.clientX,
            startY: e.clientY,
            crop: s.crop ? { ...s.crop } : { x: 0, y: 0, width: 100, height: 100 },
        };
    };

    // crop live update handler
    useEffect(() => {
        if (!isCropping || !cropStateRef.current || selectedIndex === null) return;
        const thumbnail = thumbnailRef.current;
        if (!thumbnail) return;

        const onMove = (e: MouseEvent) => {
            const rect = thumbnail.getBoundingClientRect();
            const deltaX = ((e.clientX - cropStateRef.current!.startX) / rect.width) * 100;
            const deltaY = ((e.clientY - cropStateRef.current!.startY) / rect.height) * 100;
            const newCrop = { ...cropStateRef.current!.crop };

            const cHandle = cropStateRef.current!.handle || 'se';
            if (cHandle.includes('n')) {
                newCrop.y = Math.max(0, Math.min(cropStateRef.current!.crop.y + deltaY, cropStateRef.current!.crop.y + cropStateRef.current!.crop.height - 5));
                newCrop.height = cropStateRef.current!.crop.height - (newCrop.y - cropStateRef.current!.crop.y);
            }
            if (cHandle.includes('s')) {
                newCrop.height = Math.max(5, Math.min(100 - cropStateRef.current!.crop.y, cropStateRef.current!.crop.height + deltaY));
            }
            if (cHandle.includes('w')) {
                newCrop.x = Math.max(0, Math.min(cropStateRef.current!.crop.x + deltaX, cropStateRef.current!.crop.x + cropStateRef.current!.crop.width - 5));
                newCrop.width = cropStateRef.current!.crop.width - (newCrop.x - cropStateRef.current!.crop.x);
            }
            if (cHandle.includes('e')) {
                newCrop.width = Math.max(5, Math.min(100 - cropStateRef.current!.crop.x, cropStateRef.current!.crop.width + deltaX));
            }

            setStickers(prev => prev.map((s, i) => i === selectedIndex ? { ...s, crop: newCrop } : s));
        };

        const onUp = () => {
            setIsCropping(false);
            cropStateRef.current = null;
            // commit crop (CR1): cropping creates new image for selected sticker
            commitCrop(selectedIndex);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCropping, selectedIndex, thumbnailRef.current]);

    // apply crop to selected sticker (CR1)
    const commitCrop = (idx: number) => {
        const s = stickers[idx];
        if (!s || !s.crop) return;
        const crop = s.crop;
        // if crop is full, do nothing
        if (crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const cropX = (crop.x / 100) * img.width;
            const cropY = (crop.y / 100) * img.height;
            const cropW = (crop.width / 100) * img.width;
            const cropH = (crop.height / 100) * img.height;

            const canvas = document.createElement('canvas');
            canvas.width = cropW;
            canvas.height = cropH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            const dataUrl = canvas.toDataURL();

            setStickers(prev => prev.map((x, i) => i === idx ? {
                ...x,
                src: dataUrl,
                aspectRatio: (cropW / cropH) || x.aspectRatio,
                width: Math.round(x.width),
                height: Math.round(x.width / ((cropW / cropH) || x.aspectRatio)),
                crop: { x: 0, y: 0, width: 100, height: 100 }
            } : x));
        };
        img.onerror = () => console.warn('Crop image load failed');
        img.src = s.src;
    };

    // sticker data to pass into Scene3D
    const stickerPropsForScene: StickerForScene[] = stickers.map(s => ({
        src: s.src,
        uvX: s.uvX,
        uvY: s.uvY,
        scale: s.scale,
        rotation: s.rotation,
        aspectRatio: s.aspectRatio,
    }));

    // screenshot
    const handleScreenshot = () => {
        const el = canvasRef.current;
        if (!el) return;
        const c = el.querySelector('canvas');
        if (!c) return;
        const link = document.createElement('a');
        link.download = `3d-mockup-${Date.now()}.png`;
        link.href = (c as HTMLCanvasElement).toDataURL('image/png');
        link.click();
    };

    // save
    const handleSaveProject = () => {
        const projectData = { modelPath, modelColor, stickers, timestamp: Date.now() };
        localStorage.setItem('3d-mockup-project', JSON.stringify(projectData));
        alert('Project saved!');
    };

    // click outside frame to deselect
    const onFrameClick = (e: React.MouseEvent) => {
        setSelectedIndex(null);
    };

    return (
        <div className="relative h-screen w-screen overflow-hidden font-sans">
            <Link href="/" className="absolute top-5 left-5 z-50 px-4 py-2 bg-slate-800/90 text-white rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Back to Gallery
            </Link>

            {/* Frame editor */}
            <div
                ref={frameRef}
                className="absolute top-20 right-5 w-[360px] h-[360px] border-2 border-dashed border-white/30 rounded-xl z-40 bg-black/10"
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={() => setSelectedIndex(null)}
                onClick={onFrameClick}
            >
                <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs z-30">
                    Frame Editor — drag images, resize, rotate
                </div>

                {/* stickers */}
                {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((s) => {
                    // Find the actual index in the original stickers array
                    const actualIndex = stickers.findIndex(sticker => sticker.id === s.id);
                    const isSelected = selectedIndex === actualIndex;
                    const left = `${s.uvX * 100}%`;
                    const top = `${(1 - s.uvY) * 100}%`;
                    return (
                        <div
                            key={s.id}
                            onMouseDown={(e) => startDragSticker(e, actualIndex)}
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                                width: `${s.width}px`,
                                height: `${s.height}px`,
                                zIndex: s.zIndex,
                                touchAction: 'none',
                            }}
                            className={`select-none ${isSelected ? 'outline-2 outline-[#B0A3F0]' : ''}`}
                        >
                            <img src={s.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />

                            {/* rotate handle */}
                            <div
                                onMouseDown={(e) => startRotateHandle(e, actualIndex)}
                                title="Rotate"
                                style={{
                                    position: 'absolute',
                                    right: -12,
                                    top: -12,
                                    width: 24,
                                    height: 24,
                                    background: '#B0A3F0',
                                    borderRadius: 999,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'grab',
                                    transform: `rotate(${-s.rotation}deg)`,
                                }}
                            >
                                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none"><path d="M4 4v4h4M20 20v-4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>

                            {/* resize handle */}
                            <div
                                onMouseDown={(e) => startResize(e, s.id)}
                                title="Resize"
                                style={{
                                    position: 'absolute',
                                    right: -8,
                                    bottom: -8,
                                    width: 18,
                                    height: 18,
                                    background: '#fff',
                                    borderRadius: 4,
                                    cursor: 'nwse-resize',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                }}
                            >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"><path d="M20 20L4 4M14 20l6-6M20 14l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>

                            {isSelected && <div style={{ position: 'absolute', inset: 0, border: '2px dashed rgba(176,163,240,0.9)', pointerEvents: 'none' }} />}
                        </div>
                    );
                })}

                {/* thumbnails & upload */}
                <div className="absolute bottom-2 left-2 right-2 flex gap-2 p-2 rounded bg-black/60">
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                    <div onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center w-10 h-10 rounded border-2 border-dashed border-[#B0A3F0] cursor-pointer">
                        <svg className="w-6 h-6 text-[#B0A3F0]" viewBox="0 0 24 24" fill="none"><path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>

                    <div className="flex gap-2 overflow-x-auto flex-1">
                        {stickers.map((s, idx) => {
                            const isSelected = selectedIndex === idx;
                            return (
                                <div key={s.id} className={`relative w-16 h-16 rounded overflow-hidden ${isSelected ? 'ring-2 ring-[#B0A3F0]' : 'border'}`}>
                                    <img
                                        ref={isSelected ? thumbnailRef : null}
                                        src={s.src}
                                        alt=""
                                        className="w-full h-full object-cover cursor-pointer"
                                        onClick={() => setSelectedIndex(idx)}
                                        draggable={false}
                                    />
                                    {isSelected && (
                                        <div className="absolute top-0 right-0 flex flex-col gap-1 p-1">
                                            <button title="Bring Forward" onClick={bringForward} className="bg-white/10 text-white p-1 rounded text-xs">↑</button>
                                            <button title="Send Backward" onClick={sendBackward} className="bg-white/10 text-white p-1 rounded text-xs">↓</button>
                                            <button title="Delete" onClick={deleteSelected} className="bg-red-600 text-white p-1 rounded text-xs mt-1">Del</button>
                                            <button title="Crop" onMouseDown={(e) => handleCropMouseDown(e as any, 'se')} className="bg-white/10 text-white p-1 rounded text-xs mt-1">Crop</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 3D canvas */}
            <div ref={canvasRef} className="w-full h-full" style={{ pointerEvents: 'auto', touchAction: 'none' }}>
                <Scene3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    stickers={stickerPropsForScene}
                    onModelLoad={() => { /* noop */ }}
                />
            </div>

            {/* top-right actions */}
            <div className="absolute top-5 right-5 flex gap-3 z-50">
                <button title="Save project" onClick={handleSaveProject} className="p-3.5 bg-[#B0A3F0] text-white rounded-xl">
                    Save
                </button>
                <button title="Screenshot" onClick={handleScreenshot} className="p-3.5 bg-[rgba(34,34,34,0.5)] text-white rounded-xl">
                    Shot
                </button>
            </div>

            {/* bottom toolbar */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#222222] backdrop-blur-[20px] p-5 flex justify-center items-center gap-2.5 overflow-x-auto z-20">
                <button
                    onClick={() => setActiveTool(activeTool === 'color' ? null : 'color')}
                    className={`flex flex-col items-center py-4 px-5 rounded-xl min-w-[70px] transition-all ${activeTool === 'color' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-xs">Color</span>
                </button>

                <button
                    onClick={() => setActiveTool(activeTool === 'edit' ? null : 'edit')}
                    className={`flex flex-col items-center py-4 px-5 rounded-xl min-w-[70px] transition-all ${activeTool === 'edit' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-xs">Edit</span>
                </button>

                <button
                    onClick={() => { rotateSelectedBy(15); setActiveTool('rotate'); }}
                    className={`flex flex-col items-center py-4 px-5 rounded-xl min-w-[70px] transition-all ${activeTool === 'rotate' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M21.888 13.5C21.164 18.311 17.013 22 12 22C6.477 22 2 17.523 2 12C2 6.477 6.477 2 12 2C16.1 2 19.625 4.219 21.33 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M22 4V8H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-xs">Rotate</span>
                </button>
            </div>

            {/* color picker modal */}
            {activeTool === 'color' && (
                <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] p-3 rounded z-40 border border-white/10">
                    <div className="w-[200px]">
                        <HexColorPicker color={modelColor} onChange={(val) => setModelColor(val)} />
                        <div className="mt-2 flex gap-2">
                            <div style={{ background: modelColor }} className="w-8 h-8 border" />
                            <button onClick={() => setModelColor('reset')} className="px-3 py-1 bg-white/8 rounded">Reset</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CustomizePage() {
    return (
        <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center">Loading...</div>}>
            <CustomizeContent />
        </Suspense>
    );
}












// 'use client';

// import { useState, useRef, Suspense, useEffect } from 'react';
// import { useSearchParams } from 'next/navigation';
// import dynamic from 'next/dynamic';
// import { HexColorPicker } from 'react-colorful';
// import Link from 'next/link';

// // Dynamically import Scene3D to avoid SSR issues
// const Scene3D = dynamic(() => import('@/components/Scene3D'), {
//     ssr: false,
//     loading: () => (
//         <div className="w-full h-full flex items-center justify-center bg-[#212121]">
//             <div className="text-center">
//                 <div className="w-16 h-16 border-4 border-[#B0A3F0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
//                 <p className="text-white text-lg">Loading 3D Scene...</p>
//             </div>
//         </div>
//     ),
// });

// type ToolType = 'color' | 'edit' | 'background' | 'rotate' | 'hdr' | 'view' | 'decal' | null;

// function CustomizeContent() {
//     const searchParams = useSearchParams();
//     const modelParam = searchParams.get('model');

//     const [modelPath, setModelPath] = useState(modelParam || '/models/FemaleHoodie/female_cloth1.glb');
//     const [modelColor, setModelColor] = useState('original');
//     const [uploadedImages, setUploadedImages] = useState<string[]>([]);
//     const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
//     const [stickerImage, setStickerImage] = useState<string | null>(null);
//     const [isModelLoaded, setIsModelLoaded] = useState(false);
//     const [activeTool, setActiveTool] = useState<ToolType>(null);
//     const [autoRotate, setAutoRotate] = useState(false);
//     const canvasRef = useRef<HTMLDivElement>(null);
//     const fileInputRef = useRef<HTMLInputElement>(null);
//     const frameRef = useRef<HTMLDivElement>(null);

//     // Sticker positioning in UV space (0-1 range)
//     const [stickerPosition, setStickerPosition] = useState({
//         uvX: 0.5,  // Center horizontally on UV map
//         uvY: 0.5,  // Center vertically on UV map
//         scale: 0.2, // Size relative to texture (0.2 = 20% of texture size)
//     });
//     const [stickerAspectRatio, setStickerAspectRatio] = useState(1); // width/height ratio

//     // Frame image position for visual feedback (percentage)
//     const [frameImagePos, setFrameImagePos] = useState({ x: 50, y: 50 });
//     const [frameImageSize, setFrameImageSize] = useState(80); // Size in pixels
//     const [isDragging, setIsDragging] = useState(false);
//     const [isResizing, setIsResizing] = useState(false);
//     const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, size: 0 });

//     // Crop state for each image (stores crop bounds as percentages)
//     const [imageCrops, setImageCrops] = useState<Record<number, { x: number; y: number; width: number; height: number }>>({});
//     const [isCropping, setIsCropping] = useState(false);
//     const [cropHandle, setCropHandle] = useState<'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null>(null);
//     const [cropStart, setCropStart] = useState({ x: 0, y: 0, crop: { x: 0, y: 0, width: 100, height: 100 } });
//     const thumbnailRef = useRef<HTMLImageElement>(null);

//     // Handle multiple image uploads
//     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const files = e.target.files;
//         if (files) {
//             const newImages: string[] = [];
//             const startIndex = uploadedImages.length;

//             Array.from(files).forEach((file, index) => {
//                 const reader = new FileReader();
//                 reader.onload = (event) => {
//                     const result = event.target?.result as string;
//                     newImages.push(result);

//                     // Initialize crop bounds to full image for new upload
//                     const imageIndex = startIndex + index;
//                     setImageCrops(prev => ({
//                         ...prev,
//                         [imageIndex]: { x: 0, y: 0, width: 100, height: 100 }
//                     }));

//                     if (newImages.length === files.length) {
//                         setUploadedImages([...uploadedImages, ...newImages]);
//                         if (!stickerImage) {
//                             setStickerImage(newImages[0]);
//                             setSelectedImageIndex(uploadedImages.length);
//                         }
//                     }
//                 };
//                 reader.readAsDataURL(file);
//             });
//         }
//     };

//     // Global mouse event listeners to ensure drag/resize stops even outside frame
//     useEffect(() => {
//         const handleGlobalMouseUp = () => {
//             setIsDragging(false);
//             setIsResizing(false);
//         };

//         const handleGlobalMouseMove = (e: MouseEvent) => {
//             if (!frameRef.current) return;

//             // Handle resize
//             if (isResizing) {
//                 const deltaX = e.clientX - resizeStart.x;
//                 const deltaY = e.clientY - resizeStart.y;
//                 const delta = Math.max(deltaX, deltaY);
//                 const newSize = Math.max(40, Math.min(200, resizeStart.size + delta));

//                 setFrameImageSize(newSize);

//                 const scale = 0.05 + ((newSize - 40) / (200 - 40)) * 0.45;
//                 setStickerPosition(prev => ({ ...prev, scale }));
//             }

//             // Handle drag
//             if (isDragging) {
//                 const rect = frameRef.current.getBoundingClientRect();
//                 const x = ((e.clientX - rect.left) / rect.width) * 100;
//                 const y = ((e.clientY - rect.top) / rect.height) * 100;

//                 const clampedX = Math.max(0, Math.min(100, x));
//                 const clampedY = Math.max(0, Math.min(100, y));

//                 setFrameImagePos({ x: clampedX, y: clampedY });

//                 const uvX = clampedX / 100;
//                 const uvY = clampedY / 100;

//                 setStickerPosition(prev => ({
//                     ...prev,
//                     uvX,
//                     uvY,
//                 }));
//             }
//         };

//         if (isDragging || isResizing) {
//             window.addEventListener('mouseup', handleGlobalMouseUp);
//             window.addEventListener('mousemove', handleGlobalMouseMove);
//         }

//         return () => {
//             window.removeEventListener('mouseup', handleGlobalMouseUp);
//             window.removeEventListener('mousemove', handleGlobalMouseMove);
//         };
//     }, [isDragging, isResizing, resizeStart, frameImageSize]);

//     // Handle crop dragging
//     const handleCropMouseDown = (e: React.MouseEvent, handle: typeof cropHandle) => {
//         e.stopPropagation();
//         setIsCropping(true);
//         setCropHandle(handle);

//         const crop = imageCrops[selectedImageIndex] || { x: 0, y: 0, width: 100, height: 100 };
//         setCropStart({
//             x: e.clientX,
//             y: e.clientY,
//             crop: { ...crop }
//         });
//     };

//     // Global crop mouse move
//     useEffect(() => {
//         if (!isCropping || !cropHandle || !thumbnailRef.current) return;

//         const handleCropMove = (e: MouseEvent) => {
//             const rect = thumbnailRef.current!.getBoundingClientRect();
//             const deltaX = ((e.clientX - cropStart.x) / rect.width) * 100;
//             const deltaY = ((e.clientY - cropStart.y) / rect.height) * 100;

//             const newCrop = { ...cropStart.crop };

//             // Handle different crop handles
//             if (cropHandle.includes('n')) {
//                 newCrop.y = Math.max(0, Math.min(cropStart.crop.y + deltaY, cropStart.crop.y + cropStart.crop.height - 10));
//                 newCrop.height = cropStart.crop.height - (newCrop.y - cropStart.crop.y);
//             }
//             if (cropHandle.includes('s')) {
//                 newCrop.height = Math.max(10, Math.min(100 - cropStart.crop.y, cropStart.crop.height + deltaY));
//             }
//             if (cropHandle.includes('w')) {
//                 newCrop.x = Math.max(0, Math.min(cropStart.crop.x + deltaX, cropStart.crop.x + cropStart.crop.width - 10));
//                 newCrop.width = cropStart.crop.width - (newCrop.x - cropStart.crop.x);
//             }
//             if (cropHandle.includes('e')) {
//                 newCrop.width = Math.max(10, Math.min(100 - cropStart.crop.x, cropStart.crop.width + deltaX));
//             }

//             setImageCrops(prev => ({
//                 ...prev,
//                 [selectedImageIndex]: newCrop
//             }));
//         };

//         const handleCropUp = () => {
//             setIsCropping(false);
//             setCropHandle(null);
//         };

//         window.addEventListener('mousemove', handleCropMove);
//         window.addEventListener('mouseup', handleCropUp);

//         return () => {
//             window.removeEventListener('mousemove', handleCropMove);
//             window.removeEventListener('mouseup', handleCropUp);
//         };
//     }, [isCropping, cropHandle, cropStart, selectedImageIndex]);

//     // Apply crop to selected image and update sticker
//     useEffect(() => {
//         if (!uploadedImages[selectedImageIndex]) return;

//         const crop = imageCrops[selectedImageIndex] || { x: 0, y: 0, width: 100, height: 100 };

//         // Create cropped image using canvas
//         const img = new Image();
//         img.crossOrigin = 'anonymous';
//         img.onload = () => {
//             const canvas = document.createElement('canvas');
//             const ctx = canvas.getContext('2d');
//             if (!ctx) return;

//             // Calculate crop dimensions
//             const cropX = (crop.x / 100) * img.width;
//             const cropY = (crop.y / 100) * img.height;
//             const cropWidth = (crop.width / 100) * img.width;
//             const cropHeight = (crop.height / 100) * img.height;

//             canvas.width = cropWidth;
//             canvas.height = cropHeight;

//             // Calculate and store aspect ratio
//             const aspectRatio = cropWidth / cropHeight;
//             setStickerAspectRatio(aspectRatio);

//             // Draw cropped portion
//             ctx.drawImage(
//                 img,
//                 cropX, cropY, cropWidth, cropHeight,
//                 0, 0, cropWidth, cropHeight
//             );

//             // Set as sticker image
//             setStickerImage(canvas.toDataURL());
//         };
//         img.src = uploadedImages[selectedImageIndex];
//     }, [selectedImageIndex, imageCrops, uploadedImages]);


//     // Handle image drag in frame - maps to UV coordinates
//     const handleMouseMove = (e: React.MouseEvent) => {
//         if (!frameRef.current) return;

//         // Handle resize
//         if (isResizing) {
//             const deltaX = e.clientX - resizeStart.x;
//             const deltaY = e.clientY - resizeStart.y;
//             const delta = Math.max(deltaX, deltaY);
//             const newSize = Math.max(40, Math.min(200, resizeStart.size + delta));

//             setFrameImageSize(newSize);

//             // Map frame size to sticker scale (0.05 - 0.5)
//             // 40px = 0.05 scale, 200px = 0.5 scale
//             const scale = 0.05 + ((newSize - 40) / (200 - 40)) * 0.45;
//             setStickerPosition(prev => ({ ...prev, scale }));
//             return;
//         }

//         // Handle drag
//         if (!isDragging) return;

//         const rect = frameRef.current.getBoundingClientRect();
//         const x = ((e.clientX - rect.left) / rect.width) * 100;
//         const y = ((e.clientY - rect.top) / rect.height) * 100;

//         // Clamp values between 0 and 100
//         const clampedX = Math.max(0, Math.min(100, x));
//         const clampedY = Math.max(0, Math.min(100, y));

//         setFrameImagePos({ x: clampedX, y: clampedY });

//         // Map frame position to UV coordinates (0-1 range)
//         const uvX = clampedX / 100;
//         const uvY = clampedY / 100;

//         setStickerPosition(prev => ({
//             ...prev,
//             uvX,
//             uvY,
//         }));
//     };

//     // Handle resize start
//     const handleResizeStart = (e: React.MouseEvent) => {
//         e.stopPropagation();
//         setIsResizing(true);
//         setResizeStart({
//             x: e.clientX,
//             y: e.clientY,
//             size: frameImageSize
//         });
//     };

//     // Handle image drag end
//     const handleMouseUp = () => {
//         setIsDragging(false);
//         setIsResizing(false);
//     };

//     // Take screenshot
//     const handleScreenshot = () => {
//         if (canvasRef.current) {
//             const canvas = canvasRef.current.querySelector('canvas');
//             if (canvas) {
//                 const link = document.createElement('a');
//                 link.download = `3d-mockup-${Date.now()}.png`;
//                 link.href = canvas.toDataURL('image/png');
//                 link.click();
//             }
//         }
//     };

//     // Save project
//     const handleSaveProject = () => {
//         const projectData = {
//             modelPath,
//             modelColor,
//             uploadedImages,
//             selectedImageIndex,
//             stickerImage,
//             stickerPosition,
//             timestamp: Date.now(),
//         };
//         localStorage.setItem('3d-mockup-project', JSON.stringify(projectData));
//         alert('Project saved!');
//     };

//     return (
//         <div className="relative h-screen w-screen overflow-hidden font-sans">
//             {/* Back Button */}
//             <Link
//                 href="/"
//                 className="absolute top-5 left-5 z-50 px-4 py-2 bg-slate-800/90 text-white rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2"
//             >
//                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
//                 </svg>
//                 Back to Gallery
//             </Link>

//             {/* Draggable Sticker Frame - Top Right with transparent background */}
//             {stickerImage && (
//                 <div
//                     ref={frameRef}
//                     className="absolute top-20 right-5 w-[300px] h-[300px] border-2 border-dashed border-white/30 rounded-xl z-40"
//                     style={{ backgroundColor: 'transparent' }}
//                     onMouseMove={handleMouseMove}
//                     onMouseUp={handleMouseUp}
//                     onMouseLeave={handleMouseUp}

//                 >
//                     <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
//                         Drag to position • Use handle to resize
//                     </div>

//                     {/* Draggable & Resizable Image */}
//                     <div
//                         className="absolute"
//                         style={{
//                             left: `${frameImagePos.x}%`,
//                             top: `${frameImagePos.y}%`,
//                             transform: 'translate(-50%, -50%)',
//                             width: `${frameImageSize}px`,
//                             height: `${frameImageSize}px`,
//                         }}
//                     >
//                         <img
//                             src={stickerImage}
//                             alt="Sticker"
//                             className="w-full h-full object-contain cursor-move select-none"
//                             onMouseDown={() => setIsDragging(true)}
//                             draggable={false}
//                         />

//                         {/* Resize Handle */}
//                         <div
//                             className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#B0A3F0] rounded-full cursor-nwse-resize flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
//                             onMouseDown={handleResizeStart}
//                             title="Drag to resize"
//                         >
//                             <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
//                             </svg>
//                         </div>
//                     </div>

//                     {/* Uploaded Images Thumbnails with Crop - Always show when frame is visible */}
//                     <div className="absolute top-[300px] right-0 flex gap-2 w-[300px] overflow-x-auto p-2 bg-black/60 rounded">
//                         {uploadedImages.map((img, index) => {
//                             const isSelected = selectedImageIndex === index;
//                             const crop = imageCrops[index] || { x: 0, y: 0, width: 100, height: 100 };

//                             return (
//                                 <div
//                                     key={index}
//                                     className="relative flex-shrink-0"
//                                     style={{ width: '80px', height: '80px' }}
//                                 >
//                                     {/* Base Image */}
//                                     <img
//                                         ref={isSelected ? thumbnailRef : null}
//                                         src={img}
//                                         alt={`Image ${index + 1}`}
//                                         className={`w-full h-full object-cover cursor-pointer rounded border-2 ${isSelected ? 'border-[#B0A3F0]' : 'border-white/30'
//                                             }`}
//                                         onClick={() => {
//                                             setSelectedImageIndex(index);
//                                         }}
//                                     />

//                                     {/* Crop Overlay (only on selected) */}
//                                     {isSelected && (
//                                         <div className="absolute inset-0 pointer-events-none">
//                                             {/* Darkened area outside crop */}
//                                             <div className="absolute inset-0 bg-black/40 pointer-events-none" />

//                                             {/* Crop area */}
//                                             <div
//                                                 className="absolute border-2 border-[#B0A3F0] pointer-events-auto"
//                                                 style={{
//                                                     left: `${crop.x}%`,
//                                                     top: `${crop.y}%`,
//                                                     width: `${crop.width}%`,
//                                                     height: `${crop.height}%`,
//                                                     boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
//                                                 }}
//                                             >
//                                                 {/* Corner Handles */}
//                                                 <div
//                                                     className="absolute -top-1 -left-1 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-nwse-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'nw')}
//                                                 />
//                                                 <div
//                                                     className="absolute -top-1 -right-1 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-nesw-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'ne')}
//                                                 />
//                                                 <div
//                                                     className="absolute -bottom-1 -left-1 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-nesw-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'sw')}
//                                                 />
//                                                 <div
//                                                     className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-nwse-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'se')}
//                                                 />

//                                                 {/* Edge Handles */}
//                                                 <div
//                                                     className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-ns-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'n')}
//                                                 />
//                                                 <div
//                                                     className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-ns-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 's')}
//                                                 />
//                                                 <div
//                                                     className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-ew-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'w')}
//                                                 />
//                                                 <div
//                                                     className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#B0A3F0] rounded-full cursor-ew-resize"
//                                                     onMouseDown={(e) => handleCropMouseDown(e, 'e')}
//                                                 />
//                                             </div>
//                                         </div>
//                                     )}
//                                 </div>
//                             );
//                         })}

//                         {/* Plus Button to Upload More Images */}
//                         <div
//                             className="relative flex-shrink-0 w-20 h-20 bg-white/10 hover:bg-white/20 border-2 border-dashed border-[#B0A3F0] rounded cursor-pointer flex items-center justify-center transition-all group"
//                             onClick={() => fileInputRef.current?.click()}
//                             title="Upload more images"
//                         >
//                             <svg className="w-8 h-8 text-[#B0A3F0] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                             </svg>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* 3D Canvas */}
//             <div ref={canvasRef} className="w-full h-full" style={{ pointerEvents: 'auto', touchAction: 'none' }}>
//                 <Scene3D
//                     modelPath={modelPath}
//                     modelColor={modelColor}
//                     stickerImage={stickerImage}
//                     stickerPosition={stickerPosition}
//                     stickerAspectRatio={stickerAspectRatio}
//                     onModelLoad={() => setIsModelLoaded(true)}
//                 />
//             </div>

//             {/* Top Right Action Buttons */}
//             <div className="absolute top-5 right-5 flex gap-3 z-50">
//                 <button
//                     onClick={handleSaveProject}
//                     title="Save project"
//                     className="p-3.5 bg-[#B0A3F0] text-white rounded-xl cursor-pointer flex items-center justify-center transition-all hover:-translate-y-0.5"
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="20" width="20">
//                         <path d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM224 416c-35.346 0-64-28.654-64-64 0-35.346 28.654-64 64-64s64 28.654 64 64c0 35.346-28.654 64-64 64zm96-304.52V212c0 6.627-5.373 12-12 12H76c-6.627 0-12-5.373-12-12V108c0-6.627 5.373-12 12-12h228.52c3.183 0 6.235 1.264 8.485 3.515l3.48 3.48A11.996 11.996 0 0 1 320 111.48z"></path>
//                     </svg>
//                 </button>

//                 <button
//                     onClick={handleScreenshot}
//                     title="Take screenshot"
//                     className="p-3.5 bg-[rgba(34,34,34,0.5)] text-white rounded-xl cursor-pointer flex items-center justify-center transition-all hover:-translate-y-0.5"
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20">
//                         <path d="M512 144v288c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V144c0-26.5 21.5-48 48-48h88l12.3-32.9c7-18.7 24.9-31.1 44.9-31.1h125.5c20 0 37.9 12.4 44.9 31.1L376 96h88c26.5 0 48 21.5 48 48zM376 288c0-66.2-53.8-120-120-120s-120 53.8-120 120 53.8 120 120 120 120-53.8 120-120zm-32 0c0 48.5-39.5 88-88 88s-88-39.5-88-88 39.5-88 88-88 88 39.5 88 88z"></path>
//                     </svg>
//                 </button>
//             </div>

//             {/* Bottom Toolbar */}
//             <div className="absolute bottom-0 left-0 right-0 bg-[#222222] backdrop-blur-[20px] p-5 flex justify-center items-center gap-2.5 overflow-x-auto z-20">
//                 {/* Color Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'color' ? null : 'color')}
//                     className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${activeTool === 'color' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
//                         }`}
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
//                         <path d="M167.02 309.34c-40.12 2.58-76.53 17.86-97.19 72.3-2.35 6.21-8 9.98-14.59 9.98-11.11 0-45.46-27.67-55.25-34.35C0 439.62 37.93 512 128 512c75.86 0 128-43.77 128-120.19 0-3.11-.65-6.08-.97-9.13l-88.01-73.34zM457.89 0c-15.16 0-29.37 6.71-40.21 16.45C213.27 199.05 192 203.34 192 257.09c0 13.7 3.25 26.76 8.73 38.7l63.82 53.18c7.21 1.8 14.64 3.03 22.39 3.03 62.11 0 98.11-45.47 211.16-256.46 7.38-14.35 13.9-29.85 13.9-45.99C512 20.64 486 0 457.89 0z"></path>
//                     </svg>
//                     Color
//                 </button>

//                 {/* Edit Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'edit' ? null : 'edit')}
//                     className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${activeTool === 'edit' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
//                         }`}
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
//                         <path d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48zM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56zM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48z"></path>
//                     </svg>
//                     Edit
//                 </button>

//                 {/* Sticker Size Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'decal' ? null : 'decal')}
//                     className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${activeTool === 'decal' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
//                         }`}
//                     disabled={!stickerImage}
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
//                         <path d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"></path>
//                     </svg>
//                     Size
//                 </button>

//                 {/* Background Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'background' ? null : 'background')}
//                     className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[90px] transition-all backdrop-blur-[10px] ${activeTool === 'background' ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
//                         }`}
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
//                         <path d="M204.3 5C104.9 24.4 24.8 104.3 5.2 203.4c-37 187 131.7 326.4 258.8 306.7 41.2-6.4 61.4-54.6 42.5-91.7-23.1-45.4 9.9-98.4 60.9-98.4h79.7c35.8 0 64.8-29.6 64.9-65.3C511.5 97.1 368.1-26.9 204.3 5zM96 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm32-128c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128-64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z"></path>
//                     </svg>
//                     Background
//                 </button>

//                 {/* Rotate Button */}
//                 <button
//                     onClick={() => {
//                         setAutoRotate(!autoRotate);
//                         setActiveTool('rotate');
//                     }}
//                     className={`flex flex-col items-center py-4 px-5 text-[13px] font-medium rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px] ${autoRotate ? 'bg-white/10 text-white shadow-lg' : 'bg-white/5 text-[#b0b0b0]'
//                         }`}
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" className="mb-2">
//                         <path d="M370.72 133.28C339.458 104.008 298.888 87.962 255.848 88c-77.458.068-144.328 53.178-162.791 126.85-1.344 5.363-6.122 9.15-11.651 9.15H24.103c-7.498 0-13.194-6.807-11.807-14.176C33.933 94.924 134.813 8 256 8c66.448 0 126.791 26.136 171.315 68.685L463.03 40.97C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.749zM32 296h134.059c21.382 0 32.09 25.851 16.971 40.971l-41.75 41.75c31.262 29.273 71.835 45.319 114.876 45.28 77.418-.07 144.315-53.144 162.787-126.849 1.344-5.363 6.122-9.15 11.651-9.15h57.304c7.498 0 13.194 6.807 11.807 14.176C478.067 417.076 377.187 504 256 504c-66.448 0-126.791-26.136-171.315-68.685L48.97 471.03C33.851 486.149 8 475.441 8 454.059V320c0-13.255 10.745-24 24-24z"></path>
//                     </svg>
//                     Rotate
//                 </button>

//                 {/* HDR Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'hdr' ? null : 'hdr')}
//                     className="flex flex-col items-center py-4 px-5 text-[13px] font-medium bg-white/5 text-[#b0b0b0] rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px]"
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 496 512" height="20" width="20" className="mb-2">
//                         <path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"></path>
//                     </svg>
//                     HDR
//                 </button>

//                 {/* View Button */}
//                 <button
//                     onClick={() => setActiveTool(activeTool === 'view' ? null : 'view')}
//                     className="flex flex-col items-center py-4 px-5 text-[13px] font-medium bg-white/5 text-[#b0b0b0] rounded-xl cursor-pointer min-w-[70px] transition-all backdrop-blur-[10px]"
//                 >
//                     <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 640 512" height="20" width="20" className="mb-2">
//                         <path d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"></path>
//                     </svg>
//                     View
//                 </button>
//             </div>

//             {/* Color Picker Panel */}
//             {activeTool === 'color' && (
//                 <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-2.5 rounded-[10px] border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.2)] z-40 flex gap-2.5">
//                     <div className="flex-shrink-0 w-[150px]">
//                         <HexColorPicker color={modelColor} onChange={setModelColor} />
//                     </div>
//                     <div className="flex flex-col gap-1.5">
//                         <div className="px-2 py-1.5 bg-white/8 rounded-[5px] flex items-center gap-1.5 border border-white/10 w-[120px]">
//                             <div className="w-4 h-4 rounded-[3px] border-[1.5px] border-white/40" style={{ background: modelColor }}></div>
//                             <span className="text-white text-[9px] font-mono font-semibold flex-1 overflow-hidden text-ellipsis">{modelColor}</span>
//                         </div>
//                         <button
//                             onClick={() => {
//                                 setModelColor('reset');
//                             }}
//                             className="px-2 py-2 bg-white/8 hover:bg-white/15 text-white border border-white/15 rounded-[5px] text-[10px] font-semibold transition-all flex items-center justify-center gap-1.5 w-[120px]"
//                             title="Restore original texture"
//                         >
//                             <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="12" width="12">
//                                 <path d="M370.72 133.28C339.458 104.008 298.888 87.962 255.848 88c-77.458.068-144.328 53.178-162.791 126.85-1.344 5.363-6.122 9.15-11.651 9.15H24.103c-7.498 0-13.194-6.807-11.807-14.176C33.933 94.924 134.813 8 256 8c66.448 0 126.791 26.136 171.315 68.685L463.03 40.97C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.749zM32 296h134.059c21.382 0 32.09 25.851 16.971 40.971l-41.75 41.75c31.262 29.273 71.835 45.319 114.876 45.28 77.418-.07 144.315-53.144 162.787-126.849 1.344-5.363 6.122-9.15 11.651-9.15h57.304c7.498 0 13.194 6.807 11.807 14.176C478.067 417.076 377.187 504 256 504c-66.448 0-126.791-26.136-171.315-68.685L48.97 471.03C33.851 486.149 8 475.441 8 454.059V320c0-13.255 10.745-24 24-24z"></path>
//                             </svg>
//                             Restore Original
//                         </button>
//                     </div>
//                 </div>
//             )}

//             {/* Edit Panel - Multiple Image Upload */}
//             {activeTool === 'edit' && (
//                 <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-4 rounded-2xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] z-40">
//                     <input
//                         ref={fileInputRef}
//                         type="file"
//                         accept="image/*"
//                         multiple
//                         onChange={handleImageUpload}
//                         className="hidden"
//                     />
//                     <button
//                         onClick={() => fileInputRef.current?.click()}
//                         className="flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-gradient-to-r from-[#B0A3F0] to-[#B0A3F0] text-white rounded-lg transition-all hover:shadow-lg"
//                     >
//                         <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="12" width="12">
//                             <path d="M296 384h-80c-13.3 0-24-10.7-24-24V192h-87.7c-17.8 0-26.7-21.5-14.1-34.1L242.3 5.7c7.5-7.5 19.8-7.5 27.3 0l152.2 152.2c12.6 12.6 3.7 34.1-14.1 34.1H320v168c0 13.3-10.7 24-24 24zm216-8v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h136v8c0 30.9 25.1 56 56 56h80c30.9 0 56-25.1 56-56v-8h136c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"></path>
//                         </svg>
//                         Upload Sticker Images
//                     </button>
//                     <p className="text-white/60 text-[11px] mt-2 text-center">PNG or JPG (Max 10MB each)</p>
//                     {uploadedImages.length > 0 && (
//                         <p className="text-white text-[10px] mt-1 text-center">{uploadedImages.length} image(s) uploaded</p>
//                     )}
//                 </div>
//             )}

//             {/* Sticker Size Panel */}
//             {activeTool === 'decal' && stickerImage && (
//                 <div className="absolute bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-4 rounded-2xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] z-40 min-w-[320px]">
//                     <h3 className="text-white text-sm font-semibold mb-3">Sticker Size</h3>

//                     <div className="space-y-2">
//                         <div>
//                             <label className="text-white/70 text-[10px] block mb-1">Scale (% of texture)</label>
//                             <input
//                                 type="range"
//                                 min="0.05"
//                                 max="0.5"
//                                 step="0.01"
//                                 value={stickerPosition.scale}
//                                 onChange={(e) => {
//                                     const scale = parseFloat(e.target.value);
//                                     setStickerPosition({ ...stickerPosition, scale });
//                                     // Sync frame size (0.05 = 40px, 0.5 = 200px)
//                                     const size = 40 + ((scale - 0.05) / 0.45) * (200 - 40);
//                                     setFrameImageSize(size);
//                                 }}
//                                 className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
//                             />
//                             <span className="text-white/50 text-[9px]">{(stickerPosition.scale * 100).toFixed(0)}%</span>
//                         </div>

//                         <button
//                             onClick={() => {
//                                 setStickerPosition({
//                                     uvX: 0.5,
//                                     uvY: 0.5,
//                                     scale: 0.2,
//                                 });
//                                 setFrameImagePos({ x: 50, y: 50 });
//                                 setFrameImageSize(80);
//                             }}
//                             className="w-full mt-3 px-3 py-2 bg-white/8 hover:bg-white/15 text-white border border-white/15 rounded-lg text-[11px] font-semibold transition-all"
//                         >
//                             Reset Position & Size
//                         </button>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// }

// export default function CustomizePage() {
//     return (
//         <Suspense fallback={
//             <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
//                 <div className="text-white text-lg">Loading...</div>
//             </div>
//         }>
//             <CustomizeContent />
//         </Suspense>
//     );
// }
