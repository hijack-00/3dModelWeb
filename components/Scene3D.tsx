'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* ============================================
   MODEL CONFIG
============================================ */
const MODEL_CONFIG: Record<string, {
    targetSize: number;
    groundOffset?: number;
    xOffset?: number;
    yOffset?: number;
    zOffset?: number;
}> = {
    "/models/FemaleHoodie/female_cloth1.glb": {
        targetSize: 2.5,
        groundOffset: -6,
        xOffset: 0,
        yOffset: 5.5,
        zOffset: 0,
    },
    default: {
        targetSize: 3,
        groundOffset: 0,
        xOffset: 0,
        yOffset: 0,
        zOffset: 0,
    },
};

/* ============================================
   TYPES
============================================ */
interface OriginalMaps {
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
    metalnessMap: THREE.Texture | null;
    aoMap: THREE.Texture | null;
    emissiveMap: THREE.Texture | null;
    color: THREE.Color;
}

interface Model3DProps {
    modelPath: string;
    modelColor: string;
    stickerImage: string | null;
    stickerPosition: { uvX: number; uvY: number; scale: number };
    setShadowFloor: (y: number) => void;
    onModelLoad: () => void;
}

/* ============================================
   MODEL COMPONENT
============================================ */
function Model3D({
    modelPath,
    modelColor,
    stickerImage,
    stickerPosition,
    setShadowFloor,
    onModelLoad,
}: Model3DProps) {
    const groupRef = useRef<THREE.Group>(null);
    const [model, setModel] = useState<THREE.Object3D | null>(null);
    const originalMaps = useRef(new Map<THREE.Mesh, OriginalMaps>());
    const [colorMode, setColorMode] = useState<'original' | 'custom'>('original');

    /* ------------------------------------------------
        LOAD MODEL & STORE ORIGINAL MAPS
    -------------------------------------------------- */
    useEffect(() => {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
        loader.setDRACOLoader(draco);

        loader.load(
            modelPath,
            (gltf) => {
                const object = gltf.scene;
                const config = MODEL_CONFIG[modelPath] || MODEL_CONFIG.default;

                // Auto-scale + center
                const box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = config.targetSize / maxDim;
                object.scale.set(scale, scale, scale);

                const b2 = new THREE.Box3().setFromObject(object);
                const center = b2.getCenter(new THREE.Vector3());
                const lowestY = b2.min.y;

                object.position.x = -center.x + (config.xOffset || 0);
                object.position.z = -center.z + (config.zOffset || 0);
                const groundedY = -lowestY + (config.groundOffset || 0) + (config.yOffset || 0);
                object.position.y = groundedY;
                setShadowFloor(groundedY + 0.02);

                // Store ALL original maps
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
                        color: mat.color.clone(),
                    });

                    console.log(`Loaded mesh: ${child.name}`, {
                        hasBaseColor: !!mat.map,
                        hasNormal: !!mat.normalMap,
                        hasRoughness: !!mat.roughnessMap,
                    });
                });

                setModel(object);
                setColorMode('original'); // Start in original texture mode
                onModelLoad();
            },
            undefined,
            (err) => console.error("Model load error:", err)
        );

        return () => { draco.dispose() };
    }, [modelPath]);

    /* ------------------------------------------------
        HANDLE COLOR CHANGES
        When user picks a color → switch to color mode
        When user picks "reset" → switch to original mode
    -------------------------------------------------- */
    useEffect(() => {
        if (!model || stickerImage) return; // Don't touch materials when sticker is active

        if (modelColor === "reset") {
            // RESTORE ORIGINAL TEXTURE MODE
            console.log("Restoring original textures");
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
            setColorMode('original');
        } else {
            // APPLY COLOR MODE (remove texture, show pure color)
            console.log(`Applying color mode: ${modelColor}`);
            model.traverse((child: any) => {
                if (!child.isMesh || !child.material) return;

                // Remove texture so color becomes visible
                child.material.map = null;

                // Keep other PBR maps for realistic shading
                // normalMap, roughnessMap, etc. stay active

                // Apply selected color
                child.material.color = new THREE.Color(modelColor);
                child.material.needsUpdate = true;
            });
            setColorMode('custom');
        }
    }, [model, modelColor, stickerImage]);

    /* ------------------------------------------------
        STICKER OVERLAY (works in both modes)
    -------------------------------------------------- */
    useEffect(() => {
        if (!model) return;

        // Restore when sticker removed
        if (!stickerImage) {
            // Restore based on current mode
            model.traverse((child: any) => {
                if (!child.isMesh || !child.material) return;
                const stored = originalMaps.current.get(child);
                if (!stored) return;

                if (colorMode === 'original') {
                    // Restore original textures
                    child.material.map = stored.map;
                    child.material.color = stored.color.clone();
                } else {
                    // Restore color mode (no texture)
                    child.material.map = null;
                    child.material.color = new THREE.Color(modelColor !== "reset" ? modelColor : stored.color);
                }

                child.material.normalMap = stored.normalMap;
                child.material.roughnessMap = stored.roughnessMap;
                child.material.metalnessMap = stored.metalnessMap;
                child.material.aoMap = stored.aoMap;
                child.material.emissiveMap = stored.emissiveMap;
                child.material.needsUpdate = true;
            });
            return;
        }

        // Build composite texture with sticker
        const stickerImg = new Image();
        stickerImg.crossOrigin = "anonymous";

        stickerImg.onload = () => {
            model.traverse((child: any) => {
                if (!child.isMesh || !child.material) return;
                const stored = originalMaps.current.get(child);
                if (!stored) return;

                // Determine base: either original texture or current color
                const base = colorMode === 'original' ? stored.map?.image : null;
                const texSize = base?.width || 2048;

                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = texSize;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // Draw base (original texture OR solid color)
                if (base) {
                    ctx.drawImage(base, 0, 0, texSize, texSize);
                } else {
                    ctx.fillStyle = modelColor !== "reset" ? modelColor : stored.color.getStyle();
                    ctx.fillRect(0, 0, texSize, texSize);
                }

                // Draw sticker on top
                const size = texSize * stickerPosition.scale;
                const x = stickerPosition.uvX * texSize - size / 2;
                const y = (1 - stickerPosition.uvY) * texSize - size / 2;
                ctx.drawImage(stickerImg, x, y, size, size);

                // Create composite
                const composite = new THREE.CanvasTexture(canvas);
                composite.colorSpace = THREE.SRGBColorSpace;
                composite.flipY = false;
                composite.needsUpdate = true;

                // Apply composite and keep PBR maps
                child.material.map = composite;
                child.material.normalMap = stored.normalMap;
                child.material.roughnessMap = stored.roughnessMap;
                child.material.metalnessMap = stored.metalnessMap;
                child.material.aoMap = stored.aoMap;
                child.material.emissiveMap = stored.emissiveMap;
                child.material.color = new THREE.Color("#ffffff");
                child.material.needsUpdate = true;
            });
        };

        stickerImg.src = stickerImage;
    }, [model, stickerImage, stickerPosition, modelColor, colorMode]);

    return (
        <group ref={groupRef}>
            {model && <primitive object={model} />}
        </group>
    );
}

/* ============================================
   SCENE WRAPPER
============================================ */
interface Scene3DProps {
    modelPath: string;
    modelColor: string;
    stickerImage: string | null;
    stickerPosition: { uvX: number; uvY: number; scale: number };
    backgroundColor?: string;
    onModelLoad: () => void;
}

export default function Scene3D({
    modelPath,
    modelColor,
    stickerImage,
    stickerPosition,
    backgroundColor = "#212121",
    onModelLoad,
}: Scene3DProps) {
    const [shadowFloor, setShadowFloor] = useState(0);

    return (
        <div className="w-full h-full">
            <Canvas shadows>
                <color attach="background" args={[backgroundColor]} />
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />

                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Model3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    stickerImage={stickerImage}
                    stickerPosition={stickerPosition}
                    setShadowFloor={setShadowFloor}
                    onModelLoad={onModelLoad}
                />

                <Environment preset="studio" />

                <ContactShadows
                    position={[0, shadowFloor, 0]}
                    scale={12}
                    opacity={0.5}
                    blur={2}
                    far={15}
                />

                <OrbitControls enablePan enableZoom enableRotate />
            </Canvas>
        </div>
    );
}
