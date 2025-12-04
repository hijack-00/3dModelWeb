'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* --------------------------------------------
   MODEL CONFIG — Adjust models individually
--------------------------------------------- */
const MODEL_CONFIG: Record<
    string,
    {
        targetSize: number;
        groundOffset?: number;
        xOffset?: number;
        yOffset?: number;
        zOffset?: number;
    }
> = {
    "/models/Tshirt_Oversized.glb": {
        targetSize: 2,
        groundOffset: -15,
        xOffset: 0,
        yOffset: 14.5,
        zOffset: 0,
    },

    "/models/female_cloth1.glb": {
        targetSize: 2.5,
        groundOffset: -6,
        xOffset: 0,
        yOffset: 5.5,
        zOffset: 0,
    },

    "/models/FemaleHoodie/female_cloth1.glb": {
        targetSize: 2.5,
        groundOffset: -6,
        xOffset: 0,
        yOffset: 5.5,
        zOffset: 0,
    },

    "/models/oversized_t-shirt.glb": {
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

/* --------------------------------------------
   DECAL POSITION TYPES
--------------------------------------------- */
export interface DecalPosition {
    x: number;
    y: number;
    z: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    scale: number;
}

/* --------------------------------------------
   MODEL COMPONENT with UV Sticker Overlay
--------------------------------------------- */

interface Model3DProps {
    modelPath: string;
    modelColor: string;
    stickerImage: string | null;
    stickerPosition: { uvX: number; uvY: number; scale: number };
    setShadowFloor: (y: number) => void;
    onModelLoad: () => void;
}

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
    const [originalTextures, setOriginalTextures] = useState<Map<THREE.Mesh, THREE.Texture | null>>(new Map());
    const [compositeTextures, setCompositeTextures] = useState<Map<THREE.Mesh, THREE.CanvasTexture>>(new Map());
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    /* ------------------------------------------------
        LOAD AND POSITION MODEL
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

                /** 1. Compute original bounding box */
                const box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;

                /** 2. Scale model */
                const scale = config.targetSize / maxDim;
                object.scale.set(scale, scale, scale);

                /** 3. Recalculate bounding box after scaling */
                const box2 = new THREE.Box3().setFromObject(object);
                const center2 = box2.getCenter(new THREE.Vector3());
                const lowestY = box2.min.y;

                /** 4. Auto-center model (X, Z) + per-model offsets */
                object.position.x = -center2.x + (config.xOffset || 0);
                object.position.z = -center2.z + (config.zOffset || 0);

                /** 5. Auto-ground model + offsets */
                const groundedY = -lowestY + (config.groundOffset || 0) + (config.yOffset || 0);
                object.position.y = groundedY;

                /** 6. Shadow plane slightly above floor */
                const shadowY = groundedY + 0.02;
                setShadowFloor(shadowY);

                /** 7. Store original textures */
                const texturesMap = new Map<THREE.Mesh, THREE.Texture | null>();
                object.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                        // Store the original texture (if any)
                        const originalTex = child.material.map ? child.material.map.clone() : null;
                        texturesMap.set(child, originalTex);
                    }
                });

                console.log(`Loaded ${modelPath}: scale=${scale.toFixed(3)}`);

                setOriginalTextures(texturesMap);
                setModel(object);
                onModelLoad();
            },
            undefined,
            (err) => console.error("Model loading error:", err)
        );

        return () => {
            draco.dispose();
        };
    }, [modelPath]);

    /* ------------------------------------------------
        UPDATE MODEL COLOR
    -------------------------------------------------- */
    useEffect(() => {
        if (!model) return;

        model.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const mat = child.material;
                if ("color" in mat) {
                    // Only tint if no texture is present
                    if (!mat.map) {
                        mat.color = new THREE.Color(modelColor);
                    } else {
                        mat.color = new THREE.Color('#ffffff');
                    }
                    mat.needsUpdate = true;
                }
            }
        });
    }, [model, modelColor]);

    /* ------------------------------------------------
        CREATE COMPOSITE TEXTURE (Original + Sticker)
    -------------------------------------------------- */
    useEffect(() => {
        if (!model || !stickerImage) {
            // Remove stickers and restore original textures
            model?.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    const originalTex = originalTextures.get(child);
                    child.material.map = originalTex;
                    if ("color" in child.material) {
                        child.material.color = new THREE.Color(originalTex ? '#ffffff' : modelColor);
                    }
                    child.material.needsUpdate = true;
                }
            });
            return;
        }

        // Load sticker image
        const stickerImg = new Image();
        stickerImg.crossOrigin = "anonymous";
        stickerImg.onload = () => {
            model.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    const originalTex = originalTextures.get(child);

                    // Create canvas for composite texture
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    // Set canvas size based on original texture or default
                    const texSize = originalTex ?
                        (originalTex.image?.width || 2048) : 2048;
                    canvas.width = texSize;
                    canvas.height = texSize;

                    // Draw original texture (if exists)
                    if (originalTex && originalTex.image) {
                        ctx.drawImage(originalTex.image, 0, 0, texSize, texSize);
                    } else {
                        // Fill with white if no original texture
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, texSize, texSize);
                    }

                    // Calculate sticker position and size on UV map
                    // uvX and uvY are 0-1 range, where (0,0) is bottom-left in UV space
                    const stickerSize = texSize * stickerPosition.scale;
                    const stickerX = (stickerPosition.uvX) * texSize - stickerSize / 2;
                    const stickerY = (1 - stickerPosition.uvY) * texSize - stickerSize / 2; // Flip Y for canvas

                    // Draw sticker on top
                    ctx.drawImage(
                        stickerImg,
                        stickerX,
                        stickerY,
                        stickerSize,
                        stickerSize
                    );

                    // Create texture from canvas
                    const compositeTexture = new THREE.CanvasTexture(canvas);
                    compositeTexture.colorSpace = THREE.SRGBColorSpace;
                    compositeTexture.flipY = false;
                    compositeTexture.needsUpdate = true;

                    // Apply composite texture to material
                    child.material.map = compositeTexture;
                    if ("color" in child.material) {
                        child.material.color = new THREE.Color('#ffffff');
                    }
                    child.material.needsUpdate = true;
                }
            });
        };
        stickerImg.src = stickerImage;

    }, [model, stickerImage, stickerPosition, originalTextures, modelColor]);

    /* ------------------------------------------------
        RETURN MODEL
    -------------------------------------------------- */
    return (
        <group ref={groupRef}>
            {model && <primitive object={model} />}
        </group>
    );
}

/* --------------------------------------------
   SCENE COMPONENT
--------------------------------------------- */

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
    stickerPosition = { uvX: 0.5, uvY: 0.5, scale: 0.2 },
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

                {/* PERFECT SHADOW */}
                <ContactShadows
                    position={[0, -1, 0]}
                    opacity={0.5}
                    scale={12}
                    blur={2}
                    far={15}
                />

                <OrbitControls enablePan enableZoom enableRotate minDistance={2} maxDistance={10} />
            </Canvas>
        </div>
    );
}
