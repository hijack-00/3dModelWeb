'use client';

import React, { useEffect, useRef, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { HexColorPicker } from 'react-colorful';
import Link from 'next/link';
import { getDeviceProfile, getQualitySettings, compressImage } from '@/lib/deviceUtils';
import { applyColorGrading, ColorGradingParams, DEFAULT_COLOR_GRADING, COLOR_GRADING_PRESETS } from '@/lib/colorGradingUtils';

const Scene3D = dynamic(() => import('@/components/Scene3D'), { ssr: false });

type ToolType = 'color' | 'edit' | 'background' | 'rotate' | 'hdr' | 'view' | 'decal' | 'colorGrading' | null;

interface Sticker {
    id: string;
    src: string;
    originalSrc?: string;
    uvX: number; // 0..1
    uvY: number; // 0..1 (1 = top)
    scale: number; // 0.05..0.5
    width: number; // px in editor
    height: number; // px in editor
    rotation: number; // deg
    aspectRatio: number; // w/h
    zIndex: number;
    crop?: { x: number; y: number; width: number; height: number }; // percents
    colorGrading?: Partial<ColorGradingParams>;
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

type AnimationType = 'none' | 'pulse' | 'bounce' | 'shake' | 'swing' | 'spin';

function genId() {
    return Math.random().toString(36).slice(2, 9);
}

function CustomizeContent(): JSX.Element {
    const searchParams = useSearchParams();

    // Support both old format (?model=path) and new format (?modelUrl=url&modelId=id&modelName=name&modelConfig=...)
    const modelUrlParam = searchParams.get('modelUrl');
    const modelParam = searchParams.get('model');
    const modelIdParam = searchParams.get('modelId');
    const modelNameParam = searchParams.get('modelName');
    const modelConfigParam = searchParams.get('modelConfig');

    // Parse modelConfig from URL if available
    const parsedModelConfig = modelConfigParam ? JSON.parse(decodeURIComponent(modelConfigParam)) : null;

    // Use modelUrl if available (from API), otherwise fallback to model (local path)
    const [modelPath] = useState<string>(
        modelUrlParam || modelParam || '/models/FemaleHoodie/female_cloth1.glb'
    );
    const [modelColor, setModelColor] = useState<string>('original');
    const [modelConfig] = useState<any>(parsedModelConfig);


    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const [activeTool, setActiveTool] = useState<ToolType>(null);
    const [autoRotate, setAutoRotate] = useState(false);
    const [rotationSpeed, setRotationSpeed] = useState(2);
    const [rotateBackground, setRotateBackground] = useState(false);
    const [animation, setAnimation] = useState<AnimationType>('none');
    const [animationSpeed, setAnimationSpeed] = useState(2);
    const [animateBackground, setAnimateBackground] = useState(false);
    const [isFrameExpanded, setIsFrameExpanded] = useState(true);
    const [backgroundColor, setBackgroundColor] = useState('#212121');
    const [environmentBg, setEnvironmentBg] = useState<string | null>(null);

    // Camera and Recording states
    const [showCameraMenu, setShowCameraMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const [recordingTime, setRecordingTime] = useState(0); // in seconds
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    const canvasRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const environmentInputRef = useRef<HTMLInputElement | null>(null);
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

    // Device quality settings
    const qualitySettings = useMemo(() => {
        const profile = getDeviceProfile();
        return getQualitySettings(profile);
    }, []);

    // Flutter WebView Detection & Helper
    const isFlutterWebView = () => {
        return typeof (window as any).DownloadHandler !== 'undefined';
    };

    const sendToFlutter = (blob: Blob, filename: string) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            (window as any).DownloadHandler.postMessage(`${filename}|${base64}`);
        };
        reader.readAsDataURL(blob);
    };

    // add sticker helper
    const addStickerFromDataUrl = (dataUrl: string) => {
        const img = new Image();
        img.onload = () => {
            const aspect = img.width && img.height ? img.width / img.height : 1;
            const sizePx = 100;
            const newSticker: Sticker = {
                id: genId(),
                src: dataUrl,
                originalSrc: dataUrl,
                uvX: 0.5,
                uvY: 0.5,
                scale: 0.15,
                width: sizePx,
                height: Math.round(sizePx / aspect),
                rotation: 0,
                aspectRatio: aspect,
                zIndex: stickers.length,
                crop: { x: 0, y: 0, width: 100, height: 100 },
                colorGrading: { ...DEFAULT_COLOR_GRADING },
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

        // Close edit modal after upload
        setActiveTool(null);
        // Open canvas frame to show uploaded images
        setIsFrameExpanded(true);

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = evt => {
                const data = evt.target?.result;
                if (typeof data === 'string') addStickerFromDataUrl(data);
            };
            reader.readAsDataURL(file);
        });
    };

    // environment image upload
    const handleEnvironmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = evt => {
            const data = evt.target?.result;
            if (typeof data === 'string') {
                setEnvironmentBg(data);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset input
    };

    // Color Grading Functions
    const updateColorGrading = async (paramName: keyof ColorGradingParams, value: number) => {
        if (selectedIndex === null) return;
        const sticker = stickers[selectedIndex];
        if (!sticker || !sticker.originalSrc) return;
        const newGrading = { ...sticker.colorGrading, [paramName]: value };
        try {
            const gradedImage = await applyColorGrading(sticker.originalSrc, newGrading);
            setStickers(prev => prev.map((s, i) =>
                i === selectedIndex ? { ...s, src: gradedImage, colorGrading: newGrading } : s
            ));
        } catch (error) {
            console.error('Failed to apply color grading:', error);
        }
    };

    const applyColorGradingPreset = async (presetName: keyof typeof COLOR_GRADING_PRESETS) => {
        if (selectedIndex === null) return;
        const sticker = stickers[selectedIndex];
        if (!sticker || !sticker.originalSrc) return;
        const preset = COLOR_GRADING_PRESETS[presetName];
        try {
            const gradedImage = await applyColorGrading(sticker.originalSrc, preset);
            setStickers(prev => prev.map((s, i) =>
                i === selectedIndex ? { ...s, src: gradedImage, colorGrading: preset } : s
            ));
        } catch (error) {
            console.error('Failed to apply preset:', error);
        }
    };

    const resetColorGrading = () => {
        if (selectedIndex === null) return;
        const sticker = stickers[selectedIndex];
        if (!sticker || !sticker.originalSrc) return;
        setStickers(prev => prev.map((s, i) =>
            i === selectedIndex ? {
                ...s,
                src: s.originalSrc || s.src,
                colorGrading: { ...DEFAULT_COLOR_GRADING }
            } : s
        ));
    };

    // Recording timer effect
    useEffect(() => {
        if (isRecording && !isPaused) {
            // Start timer
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } else {
            // Clear timer when paused or stopped
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }

        // Cleanup on unmount
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, [isRecording, isPaused]);

    // Helper to format recording time as MM:SS
    const formatRecordingTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // Helper to get coordinates from mouse or touch events
    const getEventCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        if ('touches' in e && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if ('clientX' in e) {
            return { x: e.clientX, y: e.clientY };
        }
        return null;
    };

    // Global mouse handlers to support drag/resize/rotate across document
    useEffect(() => {
        const onMove = (e: MouseEvent | TouchEvent) => {
            const coords = getEventCoords(e);
            if (!coords) return;

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
                    const dx = coords.x - dragStart.x;
                    const dy = coords.y - dragStart.y;
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

                dragStartRef.current = { x: coords.x, y: coords.y };
                return;
            }

            // Resizing
            if (isResizing && resizeStateRef.current) {
                const rs = resizeStateRef.current;
                const dx = coords.x - rs.x;
                const dy = coords.y - rs.y;
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
                    const angleRad = Math.atan2(coords.y - centerY, coords.x - centerX);
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
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
            window.addEventListener('touchcancel', onUp);
        }

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
            window.removeEventListener('touchcancel', onUp);
        };
    }, [isDragging, isResizing, isRotating, selectedIndex]);

    // start dragging
    const startDragSticker = (e: React.MouseEvent | React.TouchEvent, idx: number) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        if (!coords) return;
        setSelectedIndex(idx);
        setIsDragging(true);
        dragStartRef.current = { x: coords.x, y: coords.y };
    };

    // start resize
    const startResize = (e: React.MouseEvent | React.TouchEvent, stickerId: string) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        if (!coords) return;
        const s = stickers.find(x => x.id === stickerId);
        if (!s) return;
        setIsResizing(true);
        resizeStateRef.current = { id: stickerId, x: coords.x, y: coords.y, width: s.width, height: s.height };
    };

    // start rotate handle
    const startRotateHandle = (e: React.MouseEvent | React.TouchEvent, idx: number) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        if (!coords) return;
        const frame = frameRef.current;
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const s = stickers[idx];
        const centerX = s.uvX * rect.width + rect.left;
        const centerY = (1 - s.uvY) * rect.height + rect.top;
        const pointerAngleRad = Math.atan2(coords.y - centerY, coords.x - centerX);
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

    // click outside frame to deselect
    const onFrameClick = (e: React.MouseEvent) => {
        // Only deselect if clicking directly on the frame background (not on stickers or controls)
        if (e.target === e.currentTarget) {
            setSelectedIndex(null);
        }
    };

    // Control functions for selected sticker
    const moveSticker = (direction: 'up' | 'down' | 'left' | 'right') => {
        if (selectedIndex === null || !frameRef.current) return;
        const rect = frameRef.current.getBoundingClientRect();
        const moveAmount = 5 / rect.width; // Move 5 pixels in UV space

        setStickers(prev => prev.map((s, i) => {
            if (i !== selectedIndex) return s;
            let newUvX = s.uvX;
            let newUvY = s.uvY;

            if (direction === 'left') newUvX = Math.max(0, s.uvX - moveAmount);
            if (direction === 'right') newUvX = Math.min(1, s.uvX + moveAmount);
            if (direction === 'up') newUvY = Math.min(1, s.uvY + moveAmount);
            if (direction === 'down') newUvY = Math.max(0, s.uvY - moveAmount);

            return { ...s, uvX: newUvX, uvY: newUvY };
        }));
    };

    const scaleSticker = (direction: 'up' | 'down' | 'reset') => {
        if (selectedIndex === null || !frameRef.current) return;
        const rect = frameRef.current.getBoundingClientRect();

        setStickers(prev => prev.map((s, i) => {
            if (i !== selectedIndex) return s;

            let newScale = s.scale;
            if (direction === 'up') newScale = Math.min(0.5, s.scale + 0.02);
            if (direction === 'down') newScale = Math.max(0.05, s.scale - 0.02);
            if (direction === 'reset') newScale = 0.15;

            const biggest = Math.max(rect.width, rect.height);
            const newW = Math.round(newScale * biggest);
            const newH = Math.round(newW / s.aspectRatio);

            return { ...s, scale: newScale, width: newW, height: newH };
        }));
    };

    const rotateSticker = (direction: 'left' | 'right') => {
        if (selectedIndex === null) return;
        const angle = direction === 'left' ? -15 : 15;
        setStickers(prev => prev.map((s, i) =>
            i === selectedIndex ? { ...s, rotation: (s.rotation + angle) % 360 } : s
        ));
    };

    const flipSticker = (direction: 'horizontal' | 'vertical') => {
        if (selectedIndex === null) return;
        // For horizontal flip, rotate 180 on Y axis (we'll use rotation for now)
        // For vertical flip, rotate 180 on X axis
        setStickers(prev => prev.map((s, i) => {
            if (i !== selectedIndex) return s;
            if (direction === 'horizontal') {
                return { ...s, rotation: (s.rotation + 180) % 360 };
            }
            // Vertical flip would need a different approach with transforms
            return { ...s, rotation: (s.rotation + 180) % 360 };
        }));
    };

    const resetSticker = () => {
        if (selectedIndex === null || !frameRef.current) return;
        const rect = frameRef.current.getBoundingClientRect();
        setStickers(prev => prev.map((s, i) => {
            if (i !== selectedIndex) return s;
            const biggest = Math.max(rect.width, rect.height);
            const resetScale = 0.15;
            const newW = Math.round(resetScale * biggest);
            const newH = Math.round(newW / s.aspectRatio);
            return {
                ...s,
                uvX: 0.5,
                uvY: 0.5,
                scale: resetScale,
                width: newW,
                height: newH,
                rotation: 0
            };
        }));
    };

    //  Camera Functions
    const handleScreenshot = async () => {
        if (!canvasRef.current) return;

        try {
            // Get the WebGL canvas directly
            const canvas = canvasRef.current.querySelector('canvas');
            if (!canvas) {
                alert('Canvas not found');
                return;
            }

            // Capture from WebGL canvas
            canvas.toBlob((blob: Blob | null) => {
                if (!blob) return;

                const filename = `3d-model-${Date.now()}.png`;

                if (isFlutterWebView()) {
                    // Send to Flutter via JavaScript channel
                    sendToFlutter(blob, filename);
                } else {
                    // Browser download
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    link.click();
                    URL.revokeObjectURL(url);
                }
            }, 'image/png');

            setShowCameraMenu(false);
        } catch (error) {
            console.error('Screenshot failed:', error);
            alert('Failed to take screenshot');
        }
    };

    const startRecording = async () => {
        if (!canvasRef.current) return;

        try {
            // Get the canvas stream
            const canvas = canvasRef.current.querySelector('canvas');
            if (!canvas) {
                alert('Canvas not found');
                return;
            }

            // @ts-ignore
            const stream = canvas.captureStream(60); // 60 FPS

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 5000000, // 5 Mbps
            });

            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const filename = `3d-model-recording-${Date.now()}.webm`;

                if (isFlutterWebView()) {
                    // Send to Flutter via JavaScript channel
                    sendToFlutter(blob, filename);
                } else {
                    // Browser download
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    link.click();
                    URL.revokeObjectURL(url);
                }

                setRecordedChunks([]);
                setIsRecording(false);
                setIsPaused(false);
                setRecordingTime(0); // Reset timer
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(100); // Collect data every 100ms
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0); // Reset timer
            setShowCameraMenu(false);
        } catch (error) {
            console.error('Recording failed:', error);
            alert('Failed to start recording. Your browser may not support this feature.');
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
    };

    return (
        <div
            className="relative h-screen w-screen overflow-hidden font-sans"
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* <Link href="/" className="absolute top-3 left-3 md:top-5 md:left-5 z-50 px-3 py-2 md:px-4 md:py-2 bg-slate-800/90 text-white rounded-lg md:rounded-xl hover:bg-slate-700 transition-all flex items-center gap-1 md:gap-2 text-sm md:text-base">
                <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="hidden sm:inline">Back to Gallery</span>
                <span className="sm:hidden">Back</span>
            </Link> */}

            {/* Hidden file input - always available for uploads */}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />

            {/* Frame editor - only show when there are stickers AND expanded */}
            {stickers.length > 0 && isFrameExpanded && (
                <div
                    ref={frameRef}
                    className="absolute bottom-[140px] sm:bottom-[155px] left-1/2 -translate-x-1/2 w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] md:w-[360px] md:h-[360px] border-2 border-dashed border-white/30 rounded-xl z-40 bg-black/10"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={() => setSelectedIndex(null)}
                    onClick={onFrameClick}
                >
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-[10px] sm:text-xs z-30">
                        <span className="hidden sm:inline">Frame Editor — drag images, resize, rotate</span>
                        <span className="sm:hidden">Frame Editor</span>
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
                                onTouchStart={(e) => startDragSticker(e, actualIndex)}
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
                                    onTouchStart={(e) => startRotateHandle(e, actualIndex)}
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
                                    onTouchStart={(e) => startResize(e, s.id)}
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

                    {/* Control Panel for Selected Sticker */}
                    {selectedIndex !== null && (
                        <div className="absolute top-2 right-2 flex flex-col gap-0.5 sm:gap-1 z-50">
                            {/* Movement Controls - 3x3 Grid */}
                            <div className="grid grid-cols-3 gap-0.5 mb-0.5 sm:mb-1">
                                <div></div>
                                <button
                                    title="Move Up"
                                    onClick={() => moveSticker('up')}
                                    className="w-6 h-6 sm:w-7 sm:h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-1.5 h-1.5 sm:w-2 sm:h-2" viewBox="0 0 448 512" fill="currentColor">
                                        <path d="M34.9 289.5l-22.2-22.2c-9.4-9.4-9.4-24.6 0-33.9L207 39c9.4-9.4 24.6-9.4 33.9 0l194.3 194.3c9.4 9.4 9.4 24.6 0 33.9L413 289.4c-9.5 9.5-25 9.3-34.3-.4L264 168.6V456c0 13.3-10.7 24-24 24h-32c-13.3 0-24-10.7-24-24V168.6L69.2 289.1c-9.3 9.8-24.8 10-34.3.4z" />
                                    </svg>
                                </button>
                                <div></div>
                                <button
                                    title="Move Left"
                                    onClick={() => moveSticker('left')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 448 512" fill="currentColor">
                                        <path d="M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z" />
                                    </svg>
                                </button>
                                <div></div>
                                <button
                                    title="Move Right"
                                    onClick={() => moveSticker('right')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 448 512" fill="currentColor">
                                        <path d="M190.5 66.9l22.2-22.2c9.4-9.4 24.6-9.4 33.9 0L441 239c9.4 9.4 9.4 24.6 0 33.9L246.6 467.3c-9.4 9.4-24.6 9.4-33.9 0l-22.2-22.2c-9.5-9.5-9.3-25 .4-34.3L311.4 296H24c-13.3 0-24-10.7-24-24v-32c0-13.3 10.7-24 24-24h287.4L190.9 101.2c-9.8-9.3-10-24.8-.4-34.3z" />
                                    </svg>
                                </button>
                                <div></div>
                                <button
                                    title="Move Down"
                                    onClick={() => moveSticker('down')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 448 512" fill="currentColor">
                                        <path d="M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z" />
                                    </svg>
                                </button>
                                <div></div>
                            </div>

                            {/* Scale, Reset, Rotate Controls - 3x2 Grid */}
                            <div className="grid grid-cols-3 gap-0.5">
                                <button
                                    title="Scale Down"
                                    onClick={() => scaleSticker('down')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 512 512" fill="currentColor">
                                        <path d="M304 192v32c0 6.6-5.4 12-12 12H124c-6.6 0-12-5.4-12-12v-32c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12zm201 284.7L476.7 505c-9.4 9.4-24.6 9.4-33.9 0L343 405.3c-4.5-4.5-7-10.6-7-17V372c-35.3 27.6-79.7 44-128 44C93.1 416 0 322.9 0 208S93.1 0 208 0s208 93.1 208 208c0 48.3-16.4 92.7-44 128h16.3c6.4 0 12.5 2.5 17 7l99.7 99.7c9.3 9.4 9.3 24.6 0 34zM344 208c0-75.2-60.8-136-136-136S72 132.8 72 208s60.8 136 136 136 136-60.8 136-136z" />
                                    </svg>
                                </button>
                                <button
                                    title="Scale Up"
                                    onClick={() => scaleSticker('up')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 512 512" fill="currentColor">
                                        <path d="M304 192v32c0 6.6-5.4 12-12 12h-56v56c0 6.6-5.4 12-12 12h-32c-6.6 0-12-5.4-12-12v-56h-56c-6.6 0-12-5.4-12-12v-32c0-6.6 5.4-12 12-12h56v-56c0-6.6 5.4-12 12-12h32c6.6 0 12 5.4 12 12v56h56c6.6 0 12 5.4 12 12zm201 284.7L476.7 505c-9.4 9.4-24.6 9.4-33.9 0L343 405.3c-4.5-4.5-7-10.6-7-17V372c-35.3 27.6-79.7 44-128 44C93.1 416 0 322.9 0 208S93.1 0 208 0s208 93.1 208 208c0 48.3-16.4 92.7-44 128h16.3c6.4 0 12.5 2.5 17 7l99.7 99.7c9.3 9.4 9.3 24.6 0 34zM344 208c0-75.2-60.8-136-136-136S72 132.8 72 208s60.8 136 136 136 136-60.8 136-136z" />
                                    </svg>
                                </button>
                                <button
                                    title="Reset Position & Size"
                                    onClick={resetSticker}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 512 512" fill="currentColor">
                                        <path d="M212.333 224.333H12c-6.627 0-12-5.373-12-12V12C0 5.373 5.373 0 12 0h48c6.627 0 12 5.373 12 12v78.112C117.773 39.279 184.26 7.47 258.175 8.007c136.906.994 246.448 111.623 246.157 248.532C504.041 393.258 393.12 504 256.333 504c-64.089 0-122.496-24.313-166.51-64.215-5.099-4.622-5.334-12.554-.467-17.42l33.967-33.967c4.474-4.474 11.662-4.717 16.401-.525C170.76 415.336 211.58 432 256.333 432c97.268 0 176-78.716 176-176 0-97.267-78.716-176-176-176-58.496 0-110.28 28.476-142.274 72.333h98.274c6.627 0 12 5.373 12 12v48c0 6.627-5.373 12-12 12z" />
                                    </svg>
                                </button>
                                <button
                                    title="Rotate Left"
                                    onClick={() => rotateSticker('left')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50 text-xs"
                                >
                                    ↺
                                </button>
                                <button
                                    title="Rotate Right"
                                    onClick={() => rotateSticker('right')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50 text-xs"
                                >
                                    ↻
                                </button>
                                <button
                                    title="Flip Horizontal"
                                    onClick={() => flipSticker('horizontal')}
                                    className="w-7 h-7 bg-black/80 backdrop-blur-sm border border-white/30 rounded-md text-white cursor-pointer flex items-center justify-center transition-all hover:bg-black/90 hover:border-white/50"
                                >
                                    <svg className="w-2 h-2" viewBox="0 0 512 512" fill="currentColor">
                                        <path d="M0 168v-16c0-13.255 10.745-24 24-24h360V80c0-21.367 25.899-32.042 40.971-16.971l80 80c9.372 9.373 9.372 24.569 0 33.941l-80 80C409.956 271.982 384 261.456 384 240v-48H24c-13.255 0-24-10.745-24-24zm488 152H128v-48c0-21.314-25.862-32.08-40.971-16.971l-80 80c-9.372 9.373-9.372 24.569 0 33.941l80 80C102.057 463.997 128 453.437 128 432v-48h360c13.255 0 24-10.745 24-24v-16c0-13.255-10.745-24-24-24z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* thumbnails & upload */}
                    <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded bg-black/60">
                        <div onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded border-2 border-dashed border-[#B0A3F0] cursor-pointer flex-shrink-0">
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#B0A3F0]" viewBox="0 0 24 24" fill="none"><path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>

                        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto flex-1">
                            {stickers.map((s, idx) => {
                                const isSelected = selectedIndex === idx;
                                return (
                                    <div key={s.id} className={`relative w-12 h-12 sm:w-16 sm:h-16 rounded overflow-hidden flex-shrink-0 ${isSelected ? 'ring-2 ring-[#B0A3F0]' : 'border'}`}>
                                        <img
                                            ref={isSelected ? thumbnailRef : null}
                                            src={s.src}
                                            alt=""
                                            className="w-full h-full object-cover cursor-pointer"
                                            onClick={() => setSelectedIndex(idx)}
                                            draggable={false}
                                        />

                                        {/* Always visible delete button */}
                                        <button
                                            title="Remove"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const idToRemove = stickers[idx].id;
                                                setStickers(prev => prev.filter(st => st.id !== idToRemove).map((st, i) => ({ ...st, zIndex: i })));
                                                setSelectedIndex(null);
                                            }}
                                            className="absolute top-1 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs transition-all shadow-md"
                                        >
                                            ✕
                                        </button>

                                        {/* Additional controls when selected */}
                                        {isSelected && (
                                            <div className="absolute bottom-0 left-0 right-0 flex gap-1 p-1 bg-black/60">
                                                <button title="Bring Forward" onClick={bringForward} className="flex-1 bg-white/10 hover:bg-white/20 text-white p-1 rounded text-xs">↑</button>
                                                <button title="Send Backward" onClick={sendBackward} className="flex-1 bg-white/10 hover:bg-white/20 text-white p-1 rounded text-xs">↓</button>
                                                <button title="Crop" onMouseDown={(e) => handleCropMouseDown(e as any, 'se')} className="flex-1 bg-white/10 hover:bg-white/20 text-white p-1 rounded text-xs">✂</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Adjust button - positioned just left of canvas frame */}
            {stickers.length > 0 && selectedIndex !== null && isFrameExpanded && (
                <button
                    onClick={() => setActiveTool(activeTool === 'colorGrading' ? null : 'colorGrading')}
                    className={`absolute bottom-[140px] sm:bottom-[155px] left-4 sm:left-[calc(50%-230px)] md:left-[calc(50%-250px)] lg:left-[calc(50%-270px)] flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[60px] sm:min-w-[70px] transition-all flex-shrink-0 z-40 ${activeTool === 'colorGrading'
                        ? 'bg-[#B0A3F0] text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 2 A 10 10 0 0 1 12 22" stroke="currentColor" strokeWidth="2" opacity="0.3" fill="currentColor" />
                        <path d="M8 12 L 12 8 L 16 12 L 12 16 Z" fill="currentColor" opacity="0.7" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">Adjust</span>
                </button>
            )}

            {/* Color Grading Panel - positioned just left of canvas frame */}
            {activeTool === 'colorGrading' && selectedIndex !== null && stickers[selectedIndex] && (
                <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 sm:bottom-[220px] sm:left-[calc(50%-230px)] sm:translate-x-0 md:left-[calc(50%-250px)] lg:left-[calc(50%-270px)] md:bottom-[240px] bg-[#222222] p-3 sm:p-4 rounded-lg sm:rounded-xl z-50 border border-white/10 w-[min(340px,90vw)] sm:w-[300px] md:w-[320px] max-h-[calc(100vh-180px)] sm:max-h-[calc(100vh-320px)] overflow-y-auto shadow-2xl"
                    style={{ scrollbarWidth: 'thin' }}
                >
                    <div className="flex flex-col gap-3 w-full">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-white text-sm font-medium">Adjustments</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={resetColorGrading}
                                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded text-xs transition-all"
                                >
                                    Reset
                                </button>
                                <button
                                    onClick={() => setActiveTool(null)}
                                    className="w-6 h-6 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded transition-all"
                                    title="Close"
                                >
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Presets */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-white/50 text-xs">Quick Presets</span>
                            <div className="grid grid-cols-3 gap-1.5">
                                {Object.keys(COLOR_GRADING_PRESETS).slice(0, 9).map((presetName) => (
                                    <button
                                        key={presetName}
                                        onClick={() => applyColorGradingPreset(presetName as keyof typeof COLOR_GRADING_PRESETS)}
                                        className="px-2 py-1.5 bg-white/5 hover:bg-[#B0A3F0] text-white/70 hover:text-white rounded text-[10px] transition-all capitalize"
                                    >
                                        {presetName.replace(/([A-Z])/g, ' $1').trim()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Manual Adjustments */}
                        <div className="flex flex-col gap-2">
                            {/* Brightness */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Brightness</label>
                                    <span className="text-white/50 text-xs">{stickers[selectedIndex].colorGrading?.brightness || 0}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={stickers[selectedIndex].colorGrading?.brightness || 0}
                                    onChange={(e) => updateColorGrading('brightness', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>

                            {/* Exposure */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Exposure</label>
                                    <span className="text-white/50 text-xs">{(stickers[selectedIndex].colorGrading?.exposure || 0).toFixed(2)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-2"
                                    max="2"
                                    step="0.1"
                                    value={stickers[selectedIndex].colorGrading?.exposure || 0}
                                    onChange={(e) => updateColorGrading('exposure', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>

                            {/* Contrast */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Contrast</label>
                                    <span className="text-white/50 text-xs">{stickers[selectedIndex].colorGrading?.contrast || 0}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={stickers[selectedIndex].colorGrading?.contrast || 0}
                                    onChange={(e) => updateColorGrading('contrast', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>

                            {/* Saturation */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Saturation</label>
                                    <span className="text-white/50 text-xs">{stickers[selectedIndex].colorGrading?.saturation || 0}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={stickers[selectedIndex].colorGrading?.saturation || 0}
                                    onChange={(e) => updateColorGrading('saturation', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>

                            {/* Hue */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Hue</label>
                                    <span className="text-white/50 text-xs">{stickers[selectedIndex].colorGrading?.hue || 0}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    step="1"
                                    value={stickers[selectedIndex].colorGrading?.hue || 0}
                                    onChange={(e) => updateColorGrading('hue', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>

                            {/* Temperature */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-white/70 text-xs">Temperature</label>
                                    <span className="text-white/50 text-xs">{stickers[selectedIndex].colorGrading?.temperature || 0}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={stickers[selectedIndex].colorGrading?.temperature || 0}
                                    onChange={(e) => updateColorGrading('temperature', parseFloat(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-purple"
                                />
                            </div>
                        </div>

                        <p className="text-white/40 text-[10px] text-center mt-1">
                            Adjustments apply to selected image
                        </p>
                    </div>
                </div>
            )}

            {/* 3D canvas */}
            <div ref={canvasRef} className="w-full h-full" style={{ pointerEvents: 'auto', touchAction: 'none' }}>
                <Scene3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    stickers={stickerPropsForScene}
                    autoRotate={autoRotate}
                    rotationSpeed={rotationSpeed}
                    rotateBackground={rotateBackground}
                    backgroundColor={backgroundColor}
                    environmentBg={environmentBg}
                    animation={animation}
                    animationSpeed={animationSpeed}
                    animateBackground={animateBackground}
                    modelConfig={modelConfig}
                    onModelLoad={() => { /* noop */ }}
                />
            </div>

            {/* top-right actions */}
            <div className="absolute top-3 right-3 md:top-5 md:right-5 flex gap-2 md:gap-3 z-50">
                {/* Camera Button */}
                <button
                    title="Camera"
                    onClick={() => setShowCameraMenu(!showCameraMenu)}
                    className="p-2 md:p-3.5 bg-[#B0A3F0] text-white rounded-lg md:rounded-xl text-sm md:text-base relative"
                >
                    <svg className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>

            {/* Camera Menu */}
            {showCameraMenu && (
                <div className="absolute top-16 right-3 md:top-20 md:right-5 bg-[#222222] rounded-lg shadow-2xl z-50 overflow-hidden border border-white/10">
                    <button
                        onClick={handleScreenshot}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors w-full text-left"
                    >
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <div>
                            <div className="text-white font-medium">Screenshot</div>
                            <div className="text-white/60 text-xs">Capture current view</div>
                        </div>
                    </button>
                    <div className="h-px bg-white/10"></div>
                    <button
                        onClick={startRecording}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors w-full text-left"
                    >
                        <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="12" r="8" />
                        </svg>
                        <div>
                            <div className="text-white font-medium">Record Video</div>
                            <div className="text-white/60 text-xs">Start screen recording</div>
                        </div>
                    </button>
                </div>
            )}

            {/* Recording Controls Overlay */}
            {isRecording && (
                <div className="absolute top-3 left-3 md:top-5 md:left-5 bg-black/80 backdrop-blur-sm px-4 py-3 rounded-lg z-50 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 bg-red-500 rounded-full ${!isPaused ? 'animate-pulse' : ''}`}></div>
                        <span className="text-white font-medium">{isPaused ? 'Paused' : 'Recording'}</span>
                    </div>

                    {/* Timer Display */}
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="text-white font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                    </div>

                    <div className="flex gap-2">
                        {!isPaused ? (
                            <button
                                onClick={pauseRecording}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                title="Pause"
                            >
                                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="4" width="4" height="16" />
                                    <rect x="14" y="4" width="4" height="16" />
                                </svg>
                            </button>
                        ) : (
                            <button
                                onClick={resumeRecording}
                                className="p-2 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                title="Resume"
                            >
                                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </button>
                        )}

                        <button
                            onClick={stopRecording}
                            className="p-2 bg-red-500 hover:bg-red-600 rounded transition-colors"
                            title="Stop & Download"
                        >
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="6" width="12" height="12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* bottom toolbar */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#222222] backdrop-blur-[20px] p-3 sm:p-4 md:p-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 md:pb-5 flex justify-start sm:justify-center items-center gap-2 sm:gap-2.5 overflow-x-auto z-[100] scrollbar-thin scrollbar-thumb-[#B0A3F0]/50 scrollbar-track-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
                {/* Frame toggle button - show when there are stickers */}
                {stickers.length > 0 && (
                    <button
                        onClick={() => setIsFrameExpanded(!isFrameExpanded)}
                        className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[60px] sm:min-w-[70px] transition-all flex-shrink-0 ${isFrameExpanded ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        {isFrameExpanded ? (
                            // Collapse icon (down arrow)
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-0.5 sm:mb-1" viewBox="0 0 24 24" fill="none">
                                <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        ) : (
                            // Expand icon (up arrow)
                            <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                                <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                        <span className="text-[10px] sm:text-xs">{isFrameExpanded ? 'Hide' : 'Frame'}</span>
                    </button>
                )}

                <button
                    onClick={() => setActiveTool(activeTool === 'color' ? null : 'color')}
                    className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[60px] sm:min-w-[70px] transition-all flex-shrink-0 ${activeTool === 'color' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">Color</span>
                </button>

                <button
                    onClick={() => setActiveTool(activeTool === 'edit' ? null : 'edit')}
                    className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[60px] sm:min-w-[70px] transition-all flex-shrink-0 ${activeTool === 'edit' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">Edit</span>
                </button>

                <button
                    onClick={() => setActiveTool(activeTool === 'background' ? null : 'background')}
                    className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[70px] sm:min-w-[90px] transition-all flex-shrink-0 ${activeTool === 'background' ? 'bg-[#B0A3F0] text-white' : 'bg-[#B0A3F0] text-white/90 hover:text-white'
                        } shadow-[0_4px_15px_rgba(98,93,245,0.3)]`}
                >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2" viewBox="0 0 512 512" fill="currentColor">
                        <path d="M204.3 5C104.9 24.4 24.8 104.3 5.2 203.4c-37 187 131.7 326.4 258.8 306.7 41.2-6.4 61.4-54.6 42.5-91.7-23.1-45.4 9.9-98.4 60.9-98.4h79.7c35.8 0 64.8-29.6 64.9-65.3C511.5 97.1 368.1-26.9 204.3 5zM96 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm32-128c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128-64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">Background</span>
                </button>

                <button
                    onClick={() => setActiveTool(activeTool === 'view' ? null : 'view')}
                    className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[70px] sm:min-w-[90px] transition-all flex-shrink-0 ${animation !== 'none' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">Animation</span>
                </button>

                <button
                    onClick={() => setActiveTool(activeTool === 'hdr' ? null : 'hdr')}
                    className={`flex flex-col items-center py-3 px-3.5 sm:py-4 sm:px-5 rounded-lg sm:rounded-xl min-w-[60px] sm:min-w-[70px] transition-all flex-shrink-0 ${activeTool === 'hdr' ? 'bg-[#B0A3F0] text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="text-[10px] sm:text-xs">HDR</span>
                </button>
            </div>

            {/* color picker modal */}
            {activeTool === 'color' && (
                <div className="absolute bottom-[100px] sm:bottom-[120px] md:bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] p-3 rounded-lg z-40 border border-white/10 max-w-[90vw]">
                    <div className="w-[180px] sm:w-[200px]">
                        <HexColorPicker color={modelColor} onChange={(val) => setModelColor(val)} />
                        <div className="mt-2 flex gap-2">
                            <div style={{ background: modelColor }} className="w-8 h-8 border" />
                            <button onClick={() => setModelColor('reset')} className="px-3 py-1 bg-white/8 rounded">Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* edit tool modal */}
            {activeTool === 'edit' && (
                <div className="absolute bottom-[100px] sm:bottom-[120px] md:bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] p-3 sm:p-4 rounded-lg sm:rounded-xl z-40 border border-white/10 max-w-[90vw]">
                    <div className="flex flex-col items-center gap-2 sm:gap-3">
                        <h3 className="text-white text-xs sm:text-sm font-medium">Add Images</h3>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center w-24 h-24 sm:w-32 sm:h-32 rounded-lg sm:rounded-xl border-2 border-dashed border-[#B0A3F0] hover:border-[#9d8ee6] hover:bg-white/5 cursor-pointer transition-all"
                        >
                            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-[#B0A3F0] mb-1 sm:mb-2" viewBox="0 0 24 24" fill="none">
                                <path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-white/70 text-xs">Upload Image</span>
                        </button>
                        <p className="text-white/50 text-xs text-center max-w-[180px]">
                            Click to upload one or more images to apply on the model
                        </p>
                    </div>
                </div>
            )}

            {/* background tool modal */}
            {activeTool === 'background' && (
                <div className="absolute bottom-[100px] sm:bottom-[120px] md:bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] p-3 sm:p-4 rounded-lg sm:rounded-xl z-40 border border-white/10 max-w-[90vw]">
                    <div className="flex flex-col items-center gap-2 sm:gap-3">
                        <h3 className="text-white text-xs sm:text-sm font-medium">Background Color</h3>
                        <div className="w-[180px] sm:w-[200px]">
                            <HexColorPicker color={backgroundColor} onChange={(val) => setBackgroundColor(val)} />
                            <div className="mt-3 grid grid-cols-6 gap-2">
                                {['#212121', '#ffffff', '#1a1a2e', '#16213e', '#0f3460', '#533483', '#7209b7', '#f72585'].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setBackgroundColor(color)}
                                        className={`w-8 h-8 rounded-md border-2 transition-all ${backgroundColor === color ? 'border-[#B0A3F0] scale-110' : 'border-white/20'}`}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                            <div className="mt-2 flex justify-between items-center">
                                <div style={{ background: backgroundColor }} className="w-10 h-10 border rounded-md" />
                                <span className="text-white/70 text-xs">{backgroundColor}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}



            {/* Animation modal */}
            {activeTool === 'view' && (
                <div className="absolute bottom-[100px] sm:bottom-[120px] md:bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] p-4 sm:p-5 rounded-lg sm:rounded-xl z-40 border border-white/10 max-w-[90vw]">
                    <div className="flex flex-col items-center gap-3 sm:gap-4">
                        <h3 className="text-white text-sm sm:text-base font-medium">Model Animations</h3>

                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {/* None */}
                            <button
                                onClick={() => setAnimation('none')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'none'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                                    <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <span className="text-xs">None</span>
                            </button>

                            {/* Pulse */}
                            <button
                                onClick={() => setAnimation('pulse')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'pulse'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                                    <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" opacity="0.5" />
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                                </svg>
                                <span className="text-xs">Pulse</span>
                            </button>

                            {/* Bounce */}
                            <button
                                onClick={() => setAnimation('bounce')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'bounce'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="18" r="3" fill="currentColor" />
                                    <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
                                    <circle cx="12" cy="7" r="1.5" fill="currentColor" opacity="0.3" />
                                </svg>
                                <span className="text-xs">Bounce</span>
                            </button>

                            {/* Shake */}
                            <button
                                onClick={() => setAnimation('shake')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'shake'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <path d="M8 12h8M6 8h12M6 16h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <span className="text-xs">Shake</span>
                            </button>

                            {/* Swing */}
                            <button
                                onClick={() => setAnimation('swing')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'swing'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2v6M12 16v6M5.64 5.64l4.24 4.24M14.12 14.12l4.24 4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <span className="text-xs">Swing</span>
                            </button>

                            {/* Spin */}
                            <button
                                onClick={() => setAnimation('spin')}
                                className={`flex flex-col items-center p-3 sm:p-4 rounded-lg transition-all ${animation === 'spin'
                                    ? 'bg-[#B0A3F0] text-white border-2 border-[#B0A3F0]'
                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-2 border-transparent'
                                    }`}
                            >
                                <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                                </svg>
                                <span className="text-xs">Spin</span>
                            </button>
                        </div>

                        {/* Animation Speed and Background Controls - Show only when animation is active */}
                        {animation !== 'none' && (
                            <>
                                {/* Divider */}
                                <div className="h-px bg-white/10 w-full my-1"></div>

                                {/* Animation Speed Control */}
                                <div className="flex flex-col items-center gap-3 w-full">
                                    <h4 className="text-white text-sm font-medium">Animation Speed</h4>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setAnimationSpeed(Math.max(0.5, animationSpeed - 0.5))}
                                            className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center transition-all"
                                        >
                                            −
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="10"
                                                step="0.5"
                                                value={animationSpeed}
                                                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                                                className="w-32"
                                            />
                                            <span className="text-white/70 text-xs">{animationSpeed.toFixed(1)}x</span>
                                        </div>
                                        <button
                                            onClick={() => setAnimationSpeed(Math.min(10, animationSpeed + 0.5))}
                                            className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center transition-all"
                                        >
                                            +
                                        </button>
                                    </div>

                                    {/* Animate Background Checkbox */}
                                    <div className="mt-2 pt-2 border-t border-white/10 w-full">
                                        <label className="flex items-center gap-2 cursor-pointer group justify-center">
                                            <input
                                                type="checkbox"
                                                checked={animateBackground}
                                                onChange={(e) => setAnimateBackground(e.target.checked)}
                                                className="w-4 h-4 rounded border-white/30 bg-white/10 text-[#B0A3F0] focus:ring-2 focus:ring-[#B0A3F0] focus:ring-offset-0 cursor-pointer"
                                            />
                                            <span className="text-white/80 text-sm group-hover:text-white transition-colors">
                                                Animate Background
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* HDR/Environment Library modal */}
            {activeTool === 'hdr' && (
                <div className="absolute bottom-[100px] sm:bottom-[120px] md:bottom-[155px] left-1/2 -translate-x-1/2 bg-[#222222] backdrop-blur-[20px] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] z-40 min-w-[280px] sm:min-w-[320px] max-w-[92vw]">
                    <div className="mb-2 sm:mb-3 text-white text-sm sm:text-base font-bold text-center">Environment Library</div>

                    {/* Environment grid */}
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 max-h-[180px] sm:max-h-[220px] overflow-y-auto mb-2.5 sm:mb-3.5">
                        {/* None option */}
                        <button
                            title="None"
                            onClick={() => setEnvironmentBg(null)}
                            className={`rounded-xl p-0 overflow-hidden transition-all ${environmentBg === null
                                ? 'border-2 border-[#B0A3F0] bg-white/[0.04]'
                                : 'border border-white/15 bg-white/[0.04] hover:border-white/30'
                                }`}
                        >
                            <div className="h-[50px] sm:h-[68px] flex items-center justify-center text-white text-[10px] sm:text-xs">None</div>
                        </button>

                        {/* Predefined environments */}
                        {[
                            { name: 'Space', url: '/backgrounds/space.jpg' },
                            { name: 'Sky', url: '/backgrounds/sky.jpg' },
                            { name: 'Sunset', url: '/backgrounds/sunset.jpg' },
                            { name: 'Ocean', url: '/backgrounds/ocean.jpg' },
                        ].map(env => (
                            <button
                                key={env.name}
                                title={env.name}
                                onClick={() => setEnvironmentBg(env.url)}
                                className={`rounded-xl p-0 overflow-hidden transition-all ${environmentBg === env.url
                                    ? 'border-2 border-[#B0A3F0] bg-white/[0.04]'
                                    : 'border border-white/15 bg-white/[0.04] hover:border-white/30'
                                    }`}
                            >
                                <div className="w-full h-[50px] sm:h-[68px] overflow-hidden">
                                    <img
                                        alt={env.name}
                                        crossOrigin="anonymous"
                                        src={env.url}
                                        className="w-full h-full object-cover block"
                                    />
                                </div>
                                <div className="px-2 py-1.5 text-white text-xs text-center whitespace-nowrap overflow-hidden text-ellipsis">
                                    {env.name}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/8 my-3"></div>

                    {/* Upload input */}
                    <input
                        ref={environmentInputRef}
                        accept="image/*,.hdr,.exr"
                        type="file"
                        onChange={handleEnvironmentUpload}
                        className="hidden"
                    />

                    {/* Upload button */}
                    <button
                        title="Upload custom 360° image"
                        onClick={() => environmentInputRef.current?.click()}
                        className="w-full px-3 py-3 text-sm font-bold bg-gradient-to-br from-[#B0A3F0] to-[#B0A3F0] text-white border-none rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(98,93,245,0.3)] hover:shadow-[0_6px_20px_rgba(98,93,245,0.4)] transition-all"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Upload 360° Image
                    </button>

                    {/* Support text */}
                    <div className="mt-2 text-[#b0b0b0] text-xs text-center">
                        Supports HDR, EXR, JPG, PNG
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