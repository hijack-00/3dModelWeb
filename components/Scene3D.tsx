'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MODEL_CONFIG: Record<string, { targetSize: number; groundOffset?: number; xOffset?: number; yOffset?: number; zOffset?: number; }> = {
    '/models/FemaleHoodie/female_cloth1.glb': { targetSize: 2.5, groundOffset: -6, xOffset: 0, yOffset: 5.5, zOffset: 0 },
    default: { targetSize: 3, groundOffset: -1, xOffset: 0, yOffset: 0, zOffset: 0 },
};

export interface StickerForScene {
    src: string;
    uvX: number;
    uvY: number;
    scale: number;
    rotation?: number;
    aspectRatio?: number;
}

type AnimationType = 'none' | 'pulse' | 'bounce' | 'shake' | 'swing' | 'spin';

interface ModelConfig {
    targetSize?: number;
    groundOffset?: number;
    xOffset?: number;
    yOffset?: number;
    zOffset?: number;
}

interface Scene3DProps {
    modelPath: string;
    modelColor: string;
    stickers: StickerForScene[];
    backgroundColor?: string;
    environmentBg?: string | null;
    rotateBackground?: boolean;
    onModelLoad?: () => void;
    autoRotate?: boolean;
    rotationSpeed?: number;
    animation?: AnimationType;
    animationSpeed?: number;
    animateBackground?: boolean;
    modelConfig?: ModelConfig;
}

interface OriginalMaps {
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
    metalnessMap: THREE.Texture | null;
    aoMap: THREE.Texture | null;
    emissiveMap: THREE.Texture | null;
    color: THREE.Color;
}

// Simple placeholder model that shows while actual model loads
function PlaceholderModel({ modelColor }: { modelColor: string }) {
    const groupRef = useRef<THREE.Group>(null);

    // Gentle rotation and pulsing animation while loading
    useFrame((state) => {
        if (groupRef.current) {
            // Gentle rotation
            groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;

            // Pulsing/breathing effect
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
            groupRef.current.scale.set(pulse, pulse, pulse);
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            {/* Main body */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.2, 1.8, 0.4]} />
                <meshStandardMaterial
                    color={modelColor}
                    roughness={0.7}
                    metalness={0.1}
                />
            </mesh>

            {/* Left sleeve */}
            <mesh position={[-0.8, 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.4, 0.8, 0.4]} />
                <meshStandardMaterial
                    color={modelColor}
                    roughness={0.7}
                    metalness={0.1}
                />
            </mesh>

            {/* Right sleeve */}
            <mesh position={[0.8, 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.4, 0.8, 0.4]} />
                <meshStandardMaterial
                    color={modelColor}
                    roughness={0.7}
                    metalness={0.1}
                />
            </mesh>
        </group>
    );
}

function Model3D(props: {
    modelPath: string;
    modelColor: string;
    stickers: StickerForScene[];
    setShadowFloor: (y: number) => void;
    onModelLoad?: () => void;
    onProgress?: (progress: number) => void;
    animation?: AnimationType;
    animationSpeed?: number;
    modelConfig?: ModelConfig;
}) {
    const { modelPath, modelColor, stickers, setShadowFloor, onModelLoad, onProgress, animation = 'none', animationSpeed = 2, modelConfig } = props;
    const groupRef = useRef<THREE.Group | null>(null);
    const [model, setModel] = useState<THREE.Object3D | null>(null);
    const originalMaps = useRef<Map<THREE.Mesh, OriginalMaps>>(new Map());

    // Animation frame
    useFrame((state) => {
        if (!groupRef.current || !model) return;

        // Apply animations based on type with speed multiplier
        const speed = animationSpeed;

        switch (animation) {
            case 'pulse':
                // Breathing/pulsing effect
                const pulse = 1 + Math.sin(state.clock.elapsedTime * 2 * speed) * 0.1;
                groupRef.current.scale.set(pulse, pulse, pulse);
                break;

            case 'bounce':
                // Bouncing up and down
                const bounce = Math.abs(Math.sin(state.clock.elapsedTime * 2 * speed)) * 0.3;
                groupRef.current.position.y = bounce;
                groupRef.current.scale.set(1, 1, 1);
                break;

            case 'shake':
                // Shaking left and right
                const shake = Math.sin(state.clock.elapsedTime * 10 * speed) * 0.05;
                groupRef.current.position.x = shake;
                groupRef.current.position.y = 0;
                groupRef.current.scale.set(1, 1, 1);
                break;

            case 'swing':
                // Swinging rotation
                const swing = Math.sin(state.clock.elapsedTime * 1.5 * speed) * 0.3;
                groupRef.current.rotation.z = swing;
                groupRef.current.position.set(0, 0, 0);
                groupRef.current.scale.set(1, 1, 1);
                break;

            case 'spin':
                // Continuous spinning
                groupRef.current.rotation.y += 0.02 * speed;
                groupRef.current.position.set(0, 0, 0);
                groupRef.current.scale.set(1, 1, 1);
                break;

            case 'none':
            default:
                // Reset to normal
                groupRef.current.position.set(0, 0, 0);
                groupRef.current.rotation.set(0, 0, 0);
                groupRef.current.scale.set(1, 1, 1);
                break;
        }
    });

    useEffect(() => {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);

        loader.load(
            modelPath,
            gltf => {
                const object = gltf.scene;
                // Use API modelConfig if available, otherwise use hardcoded config, otherwise use default
                const config = modelConfig || MODEL_CONFIG[modelPath] || MODEL_CONFIG.default;

                // autoscale + center
                const box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const scale = (config.targetSize || 3) / maxDim;
                object.scale.set(scale, scale, scale);

                const b2 = new THREE.Box3().setFromObject(object);
                const center = b2.getCenter(new THREE.Vector3());
                const lowestY = b2.min.y;

                object.position.x = -center.x + (config.xOffset || 0);
                object.position.z = -center.z + (config.zOffset || 0);
                const groundedY = -lowestY + (config.groundOffset || 0) + (config.yOffset || 0);
                object.position.y = groundedY;
                setShadowFloor && setShadowFloor(groundedY + 0.02);

                // store original maps
                object.traverse((child: any) => {
                    if (!child.isMesh || !child.material) return;
                    const mat = child.material;
                    originalMaps.current.set(child, {
                        map: mat.map || null,
                        normalMap: mat.normalMap || null,
                        roughnessMap: mat.roughnessMap || null,
                        metalnessMap: mat.metalnessMap || null,
                        aoMap: mat.aoMap || null,
                        emissiveMap: mat.emissiveMap || null,
                        color: mat.color ? mat.color.clone() : new THREE.Color('#ffffff'),
                    });
                });

                setModel(object);
                onProgress && onProgress(100);
                onModelLoad && onModelLoad();
            },
            (xhr) => {
                // Progress callback
                if (xhr.lengthComputable && onProgress) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    onProgress(Math.min(percentComplete, 99)); // Keep at 99% until fully loaded
                }
            },
            err => {
                console.error('Model load error', err);
            }
        );

        return () => { draco.dispose() };
    }, [modelPath]);

    // Bake textures whenever stickers or color changes
    useEffect(() => {
        if (!model) return;

        model.traverse((child: any) => {
            if (!child.isMesh || !child.material) return;
            const stored = originalMaps.current.get(child);
            if (!stored) return;

            const baseImage = stored.map?.image;
            const texWidth = (baseImage && baseImage.width) ? baseImage.width : 2048;
            const texHeight = (baseImage && baseImage.height) ? baseImage.height : texWidth;

            const canvas = document.createElement('canvas');
            canvas.width = texWidth;
            canvas.height = texHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // If user picked a color (excluding 'reset'/'original'), use solid color instead of texture
            if (modelColor && modelColor !== 'reset' && modelColor !== 'original') {
                // Apply solid color background
                ctx.fillStyle = modelColor;
                ctx.fillRect(0, 0, texWidth, texHeight);
            } else {
                // Use original texture or stored color
                if (baseImage) {
                    try {
                        ctx.drawImage(baseImage, 0, 0, texWidth, texHeight);
                    } catch (err) {
                        ctx.fillStyle = stored.color.getStyle();
                        ctx.fillRect(0, 0, texWidth, texHeight);
                    }
                } else {
                    ctx.fillStyle = stored.color.getStyle();
                    ctx.fillRect(0, 0, texWidth, texHeight);
                }
            }

            // Draw stickers sequentially (stack order = array order)
            const drawSticker = (sticker: StickerForScene) => {
                return new Promise<void>(resolve => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const baseSize = (sticker.scale ?? 0.15) * Math.max(texWidth, texHeight);
                        const aspect = sticker.aspectRatio ?? ((img.width / img.height) || 1);
                        let stickerW = baseSize;
                        let stickerH = baseSize;
                        if (aspect > 1) {
                            stickerW = baseSize;
                            stickerH = baseSize / aspect;
                        } else {
                            stickerH = baseSize;
                            stickerW = baseSize * aspect;
                        }
                        const x = sticker.uvX * texWidth - stickerW / 2;
                        const y = (1 - sticker.uvY) * texHeight - stickerH / 2;

                        ctx.save();
                        const cx = x + stickerW / 2;
                        const cy = y + stickerH / 2;
                        const angle = (sticker.rotation ?? 0) * Math.PI / 180;
                        ctx.translate(cx, cy);
                        ctx.rotate(angle);
                        ctx.drawImage(img, -stickerW / 2, -stickerH / 2, stickerW, stickerH);
                        ctx.restore();
                        resolve();
                    };
                    img.onerror = () => {
                        console.warn('Sticker image failed to load during bake', sticker.src);
                        resolve();
                    };
                    img.src = sticker.src;
                });
            };

            (async () => {
                for (let i = 0; i < stickers.length; i++) {
                    if (stickers[i]) await drawSticker(stickers[i]);
                }

                const composite = new THREE.CanvasTexture(canvas);
                // set color space if supported
                try {
                    // @ts-ignore
                    composite.colorSpace = (THREE as any).SRGBColorSpace || THREE.SRGBColorSpace;
                } catch { /* ignore */ }
                composite.flipY = false;
                composite.needsUpdate = true;

                child.material.map = composite;
                child.material.normalMap = stored.normalMap;
                child.material.roughnessMap = stored.roughnessMap;
                child.material.metalnessMap = stored.metalnessMap;
                child.material.aoMap = stored.aoMap;
                child.material.emissiveMap = stored.emissiveMap;

                // Always use white color for material since we're baking color into texture
                child.material.color = new THREE.Color('#ffffff');

                child.material.needsUpdate = true;
            })();
        });
    }, [model, stickers, modelColor]);

    // If user selects 'reset' explicitly, restore originals
    useEffect(() => {
        if (!model) return;
        if (modelColor === 'reset') {
            model.traverse((child: any) => {
                if (!child.isMesh || !child.material) return;
                const stored = originalMaps.current.get(child);
                if (!stored) return;
                child.material.map = stored.map;
                child.material.normalMap = stored.normalMap;
                child.material.roughnessMap = stored.roughnessMap;
                child.material.metalnessMap = stored.metalnessMap;
                child.material.aoMap = stored.aoMap;
                child.material.emissiveMap = stored.emissiveMap;
                child.material.color = stored.color.clone();
                child.material.needsUpdate = true;
            });
        }
    }, [modelColor, model]);

    return (
        <group ref={groupRef}>
            {model ? (
                <primitive object={model} />
            ) : (
                <PlaceholderModel modelColor={modelColor} />
            )}
        </group>
    );
}

// Component to render and optionally rotate the background
function RotatingBackground({ texture, rotationSpeed, shouldRotate, autoRotate }: { texture: THREE.Texture; rotationSpeed: number; shouldRotate: boolean; autoRotate: boolean }) {
    const meshRef = useRef<THREE.Mesh>(null);

    // Use useFrame for smooth animation tied to Three.js render loop
    useFrame(() => {
        if (!meshRef.current) return;

        if (autoRotate) {
            // OrbitControls uses this exact formula: angle = 2 * PI / 60 / 60 * autoRotateSpeed
            const rotationAngle = 2 * Math.PI / 60 / 60 * rotationSpeed;

            if (shouldRotate) {
                // Background rotates WITH the scene (same direction as camera)
                // Do nothing - let OrbitControls handle it naturally
            } else {
                // Background stays FIXED - counter-rotate to compensate for camera rotation
                // OrbitControls rotates camera, so we counter-rotate the background
                meshRef.current.rotation.y -= rotationAngle;
            }
        }
    });

    return (
        <mesh ref={meshRef} scale={[-1, 1, 1]}>
            <sphereGeometry args={[500, 60, 40]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} />
        </mesh>
    );
}

export default function Scene3D({ modelPath, modelColor, stickers, backgroundColor = '#212121', environmentBg = null, rotateBackground = false, onModelLoad, autoRotate = false, rotationSpeed = 2, animation = 'none', animationSpeed = 2, animateBackground = false, modelConfig }: Scene3DProps) {
    const [shadowFloor, setShadowFloor] = useState(0);
    const [envTexture, setEnvTexture] = useState<THREE.Texture | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);

    // Load environment texture when environmentBg changes
    useEffect(() => {
        if (!environmentBg) {
            setEnvTexture(null);
            return;
        }

        const loader = new THREE.TextureLoader();
        loader.load(
            environmentBg,
            (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.colorSpace = THREE.SRGBColorSpace;
                setEnvTexture(texture);
            },
            undefined,
            (err) => {
                console.error('Failed to load environment texture:', err);
                setEnvTexture(null);
            }
        );
    }, [environmentBg]);

    // Reset loading state when model changes
    useEffect(() => {
        setIsLoading(true);
        setLoadingProgress(0);
    }, [modelPath]);

    const handleModelLoad = () => {
        setIsLoading(false);
        setLoadingProgress(100);
        onModelLoad?.();
    };

    const handleProgress = (progress: number) => {
        setLoadingProgress(Math.round(progress));
    };

    return (
        <div className="w-full h-full relative">
            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 backdrop-blur-sm px-8 py-6 rounded-lg shadow-2xl">
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-white text-lg font-medium">
                                    The model is loading
                                    <span className="loading-dots inline-block w-8 text-left ml-0.5">
                                        <span>.</span>
                                        <span>.</span>
                                        <span>.</span>
                                    </span>
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white/70 text-sm">{loadingProgress}%</span>
                                </div>
                                <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 transition-all duration-300 ease-out"
                                        style={{ width: `${loadingProgress}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Canvas
                shadows
                gl={{ preserveDrawingBuffer: true }}
            >
                {!envTexture && <color attach="background" args={[backgroundColor]} />}
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                {/* Render background sphere if environment texture exists */}
                {envTexture && (
                    <RotatingBackground
                        texture={envTexture}
                        rotationSpeed={animation !== 'none' ? animationSpeed : rotationSpeed}
                        shouldRotate={animation !== 'none' ? animateBackground : rotateBackground}
                        autoRotate={animation !== 'none' || autoRotate}
                    />
                )}

                <Model3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    stickers={stickers}
                    setShadowFloor={setShadowFloor}
                    onModelLoad={handleModelLoad}
                    onProgress={handleProgress}
                    animation={animation}
                    animationSpeed={animationSpeed}
                    modelConfig={modelConfig}
                />
                <Environment preset="studio" />
                <ContactShadows position={[0, shadowFloor, 0]} scale={12} opacity={0.5} blur={2} far={15} />
                <OrbitControls
                    enablePan
                    enableZoom
                    enableRotate
                    autoRotate={autoRotate}
                    autoRotateSpeed={rotationSpeed}
                />
            </Canvas>
        </div>
    );
}
