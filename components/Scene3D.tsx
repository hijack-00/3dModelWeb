'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MODEL_CONFIG: Record<string, { targetSize: number; groundOffset?: number; xOffset?: number; yOffset?: number; zOffset?: number; }> = {
    '/models/FemaleHoodie/female_cloth1.glb': { targetSize: 2.5, groundOffset: -6, xOffset: 0, yOffset: 5.5, zOffset: 0 },
    default: { targetSize: 3, groundOffset: 0, xOffset: 0, yOffset: 0, zOffset: 0 },
};

export interface StickerForScene {
    src: string;
    uvX: number;
    uvY: number;
    scale: number;
    rotation?: number;
    aspectRatio?: number;
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

    // Gentle rotation animation while loading
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
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
}) {
    const { modelPath, modelColor, stickers, setShadowFloor, onModelLoad } = props;
    const groupRef = useRef<THREE.Group | null>(null);
    const [model, setModel] = useState<THREE.Object3D | null>(null);
    const originalMaps = useRef<Map<THREE.Mesh, OriginalMaps>>(new Map());

    useEffect(() => {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);

        loader.load(modelPath, gltf => {
            const object = gltf.scene;
            const config = MODEL_CONFIG[modelPath] || MODEL_CONFIG.default;

            // autoscale + center
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = config.targetSize / maxDim;
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
            onModelLoad && onModelLoad();
        }, undefined, err => {
            console.error('Model load error', err);
        });

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
                    // draw each sticker sequentially
                    // if sticker is invalid we skip (drawSticker resolves anyway)
                    // Note: if many large stickers this is async but okay for prototyping
                    // Could be optimized with Promise.all when order is not required
                    // but order matters for stacking so we await sequentially.
                    // Ensure stickers[i] is defined
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

export default function Scene3D({ modelPath, modelColor, stickers, backgroundColor = '#212121', environmentBg = null, rotateBackground = false, onModelLoad, autoRotate = false, rotationSpeed = 2 }: Scene3DProps) {
    const [shadowFloor, setShadowFloor] = useState(0);
    const [envTexture, setEnvTexture] = useState<THREE.Texture | null>(null);

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

    return (
        <div className="w-full h-full">
            <Canvas shadows>
                {!envTexture && <color attach="background" args={[backgroundColor]} />}
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                {/* Render background sphere if environment texture exists */}
                {envTexture && <RotatingBackground texture={envTexture} rotationSpeed={rotationSpeed} shouldRotate={rotateBackground} autoRotate={autoRotate} />}

                <Model3D modelPath={modelPath} modelColor={modelColor} stickers={stickers} setShadowFloor={setShadowFloor} onModelLoad={onModelLoad} />
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









// 'use client';

// import { useRef, useEffect, useState } from 'react';
// import { Canvas } from '@react-three/fiber';
// import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
// import * as THREE from 'three';
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// /* ============================================
//    MODEL CONFIG
// ============================================ */
// const MODEL_CONFIG: Record<string, {
//     targetSize: number;
//     groundOffset?: number;
//     xOffset?: number;
//     yOffset?: number;
//     zOffset?: number;
// }> = {
//     "/models/FemaleHoodie/female_cloth1.glb": {
//         targetSize: 2.5,
//         groundOffset: -6,
//         xOffset: 0,
//         yOffset: 5.5,
//         zOffset: 0,
//     },

//     "/models/Tshirt_Oversized.glb": {
//         targetSize: 3,        // Adjust to fit in view
//         groundOffset: 0,      // Adjust so it sits on ground
//         xOffset: 0,
//         yOffset: 0,
//         zOffset: 0,
//     },

//     "/models/oversized_t-shirt.glb": {
//         targetSize: 3,        // Adjust to fit in view
//         groundOffset: 0,      // Adjust so it sits on ground
//         xOffset: 0,
//         yOffset: 0,
//         zOffset: 0,
//     },

//     default: {
//         targetSize: 3,
//         groundOffset: 0,
//         xOffset: 0,
//         yOffset: 0,
//         zOffset: 0,
//     },
// };

// /* ============================================
//    TYPES
// ============================================ */
// interface OriginalMaps {
//     map: THREE.Texture | null;
//     normalMap: THREE.Texture | null;
//     roughnessMap: THREE.Texture | null;
//     metalnessMap: THREE.Texture | null;
//     aoMap: THREE.Texture | null;
//     emissiveMap: THREE.Texture | null;
//     color: THREE.Color;
// }

// interface Model3DProps {
//     modelPath: string;
//     modelColor: string;
//     stickerImage: string | null;
//     stickerPosition: { uvX: number; uvY: number; scale: number };
//     stickerAspectRatio: number;
//     setShadowFloor: (y: number) => void;
//     onModelLoad: () => void;
// }

// /* ============================================
//    MODEL COMPONENT
// ============================================ */
// function Model3D({
//     modelPath,
//     modelColor,
//     stickerImage,
//     stickerPosition,
//     stickerAspectRatio,
//     setShadowFloor,
//     onModelLoad,
// }: Model3DProps) {
//     const groupRef = useRef<THREE.Group>(null);
//     const [model, setModel] = useState<THREE.Object3D | null>(null);
//     const originalMaps = useRef(new Map<THREE.Mesh, OriginalMaps>());
//     const [colorMode, setColorMode] = useState<'original' | 'custom'>('original');

//     /* ------------------------------------------------
//         LOAD MODEL & STORE ORIGINAL MAPS
//     -------------------------------------------------- */
//     useEffect(() => {
//         const loader = new GLTFLoader();
//         const draco = new DRACOLoader();
//         draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
//         loader.setDRACOLoader(draco);

//         loader.load(
//             modelPath,
//             (gltf) => {
//                 const object = gltf.scene;
//                 const config = MODEL_CONFIG[modelPath] || MODEL_CONFIG.default;

//                 // Auto-scale + center
//                 const box = new THREE.Box3().setFromObject(object);
//                 const size = box.getSize(new THREE.Vector3());
//                 const maxDim = Math.max(size.x, size.y, size.z);
//                 const scale = config.targetSize / maxDim;
//                 object.scale.set(scale, scale, scale);

//                 const b2 = new THREE.Box3().setFromObject(object);
//                 const center = b2.getCenter(new THREE.Vector3());
//                 const lowestY = b2.min.y;

//                 object.position.x = -center.x + (config.xOffset || 0);
//                 object.position.z = -center.z + (config.zOffset || 0);
//                 const groundedY = -lowestY + (config.groundOffset || 0) + (config.yOffset || 0);
//                 object.position.y = groundedY;
//                 setShadowFloor(groundedY + 0.02);

//                 // Store ALL original maps
//                 object.traverse((child: any) => {
//                     if (!child.isMesh || !child.material) return;
//                     const mat = child.material;

//                     originalMaps.current.set(child, {
//                         map: mat.map || null,
//                         normalMap: mat.normalMap || null,
//                         roughnessMap: mat.roughnessMap || null,
//                         metalnessMap: mat.metalnessMap || null,
//                         aoMap: mat.aoMap || null,
//                         emissiveMap: mat.emissiveMap || null,
//                         color: mat.color.clone(),
//                     });
//                 });

//                 setModel(object);
//                 setColorMode('original');
//                 onModelLoad();
//             },
//             undefined,
//             (err) => console.error("Model load error:", err)
//         );

//         return () => { draco.dispose() };
//     }, [modelPath]);

//     /* ------------------------------------------------
//         HANDLE COLOR CHANGES
//     -------------------------------------------------- */
//     useEffect(() => {
//         if (!model) return;

//         if (modelColor === "reset" || modelColor === "original") {
//             setColorMode('original');

//             // Only update materials if no sticker is active
//             if (!stickerImage) {
//                 model.traverse((child: any) => {
//                     if (!child.isMesh || !child.material) return;
//                     const stored = originalMaps.current.get(child);
//                     if (!stored) return;

//                     child.material.map = stored.map;
//                     child.material.normalMap = stored.normalMap;
//                     child.material.roughnessMap = stored.roughnessMap;
//                     child.material.metalnessMap = stored.metalnessMap;
//                     child.material.aoMap = stored.aoMap;
//                     child.material.emissiveMap = stored.emissiveMap;
//                     child.material.color = stored.color.clone();
//                     child.material.needsUpdate = true;
//                 });
//             }
//         } else {
//             setColorMode('custom');

//             // Only update materials if no sticker is active
//             if (!stickerImage) {
//                 model.traverse((child: any) => {
//                     if (!child.isMesh || !child.material) return;

//                     child.material.map = null;
//                     child.material.color = new THREE.Color(modelColor);
//                     child.material.needsUpdate = true;
//                 });
//             }
//         }
//     }, [model, modelColor, stickerImage]);

//     /* ------------------------------------------------
//         STICKER OVERLAY
//     -------------------------------------------------- */
//     useEffect(() => {
//         if (!model) return;

//         if (!stickerImage) {
//             // Restore based on current mode
//             model.traverse((child: any) => {
//                 if (!child.isMesh || !child.material) return;
//                 const stored = originalMaps.current.get(child);
//                 if (!stored) return;

//                 if (colorMode === 'original') {
//                     child.material.map = stored.map;
//                     child.material.color = stored.color.clone();
//                 } else {
//                     child.material.map = null;
//                     child.material.color = new THREE.Color(modelColor !== "reset" && modelColor !== "original" ? modelColor : stored.color);
//                 }

//                 child.material.normalMap = stored.normalMap;
//                 child.material.roughnessMap = stored.roughnessMap;
//                 child.material.metalnessMap = stored.metalnessMap;
//                 child.material.aoMap = stored.aoMap;
//                 child.material.emissiveMap = stored.emissiveMap;
//                 child.material.needsUpdate = true;
//             });
//             return;
//         }

//         // Build composite texture
//         const stickerImg = new Image();
//         stickerImg.crossOrigin = "anonymous";

//         stickerImg.onload = () => {
//             model.traverse((child: any) => {
//                 if (!child.isMesh || !child.material) return;
//                 const stored = originalMaps.current.get(child);
//                 if (!stored) return;

//                 const base = colorMode === 'original' ? stored.map?.image : null;
//                 const texSize = base?.width || 2048;

//                 const canvas = document.createElement("canvas");
//                 canvas.width = canvas.height = texSize;
//                 const ctx = canvas.getContext("2d");
//                 if (!ctx) return;

//                 // Draw base
//                 if (base) {
//                     ctx.drawImage(base, 0, 0, texSize, texSize);
//                 } else {
//                     ctx.fillStyle = (modelColor !== "reset" && modelColor !== "original") ? modelColor : stored.color.getStyle();
//                     ctx.fillRect(0, 0, texSize, texSize);
//                 }

//                 // Draw sticker with proper aspect ratio
//                 const baseSize = texSize * stickerPosition.scale;
//                 let stickerWidth, stickerHeight;

//                 if (stickerAspectRatio > 1) {
//                     // Wide image
//                     stickerWidth = baseSize;
//                     stickerHeight = baseSize / stickerAspectRatio;
//                 } else {
//                     // Tall or square image
//                     stickerHeight = baseSize;
//                     stickerWidth = baseSize * stickerAspectRatio;
//                 }

//                 const x = stickerPosition.uvX * texSize - stickerWidth / 2;
//                 const y = (1 - stickerPosition.uvY) * texSize - stickerHeight / 2;
//                 ctx.drawImage(stickerImg, x, y, stickerWidth, stickerHeight);

//                 // Create composite
//                 const composite = new THREE.CanvasTexture(canvas);
//                 composite.colorSpace = THREE.SRGBColorSpace;
//                 composite.flipY = false;
//                 composite.needsUpdate = true;

//                 // Apply composite and keep PBR maps
//                 child.material.map = composite;
//                 child.material.normalMap = stored.normalMap;
//                 child.material.roughnessMap = stored.roughnessMap;
//                 child.material.metalnessMap = stored.metalnessMap;
//                 child.material.aoMap = stored.aoMap;
//                 child.material.emissiveMap = stored.emissiveMap;
//                 child.material.color = new THREE.Color("#ffffff");
//                 child.material.needsUpdate = true;
//             });
//         };

//         stickerImg.src = stickerImage;
//     }, [model, stickerImage, stickerPosition, modelColor, colorMode, stickerAspectRatio]);

//     return (
//         <group ref={groupRef}>
//             {model && <primitive object={model} />}
//         </group>
//     );
// }

// /* ============================================
//    SCENE WRAPPER
// ============================================ */
// interface Scene3DProps {
//     modelPath: string;
//     modelColor: string;
//     stickerImage: string | null;
//     stickerPosition: { uvX: number; uvY: number; scale: number };
//     stickerAspectRatio: number;
//     backgroundColor?: string;
//     onModelLoad: () => void;
// }

// export default function Scene3D({
//     modelPath,
//     modelColor,
//     stickerImage,
//     stickerPosition,
//     stickerAspectRatio,
//     backgroundColor = "#212121",
//     onModelLoad,
// }: Scene3DProps) {
//     const [shadowFloor, setShadowFloor] = useState(0);

//     return (
//         <div className="w-full h-full">
//             <Canvas shadows>
//                 <color attach="background" args={[backgroundColor]} />
//                 <PerspectiveCamera makeDefault position={[0, 0, 5]} />

//                 <ambientLight intensity={0.5} />
//                 <spotLight position={[10, 10, 10]} intensity={1} castShadow />
//                 <pointLight position={[-10, -10, -10]} intensity={0.5} />

//                 <Model3D
//                     modelPath={modelPath}
//                     modelColor={modelColor}
//                     stickerImage={stickerImage}
//                     stickerPosition={stickerPosition}
//                     stickerAspectRatio={stickerAspectRatio}
//                     setShadowFloor={setShadowFloor}
//                     onModelLoad={onModelLoad}
//                 />

//                 <Environment preset="studio" />

//                 <ContactShadows
//                     position={[0, shadowFloor, 0]}
//                     scale={12}
//                     opacity={0.5}
//                     blur={2}
//                     far={15}
//                 />

//                 <OrbitControls enablePan enableZoom enableRotate />
//             </Canvas>
//         </div>
//     );
// }
