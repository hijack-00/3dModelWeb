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
        zOffset: 0, // FIX rotation center
    },




    // "/models/Tshirt_Oversized.glb": {
    //     targetSize: 3,
    //     groundOffset: -0.1,
    //     xOffset: 0,
    //     yOffset: 0,
    //     zOffset: 0,
    // },

    // "/models/female_cloth1.glb": {
    //     targetSize: 100,
    //     groundOffset: -0.5,
    //     xOffset: 0,
    //     yOffset: 0,
    //     zOffset: -0.4, // Fix model rotation center
    // },

    default: {
        targetSize: 3,
        groundOffset: 0,
        xOffset: 0,
        yOffset: 0,
        zOffset: 0,
    },
};

/* --------------------------------------------
   MODEL COMPONENT
--------------------------------------------- */

interface Model3DProps {
    modelPath: string;
    modelColor: string;
    decalImage: string | null;
    setShadowFloor: (y: number) => void;
    onModelLoad: () => void;
}

function Model3D({ modelPath, modelColor, decalImage, setShadowFloor, onModelLoad }: Model3DProps) {
    const groupRef = useRef<THREE.Group>(null);
    const [model, setModel] = useState<THREE.Object3D | null>(null);

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
                const center = box.getCenter(new THREE.Vector3());
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

                console.log(
                    `Loaded ${modelPath}: scale=${scale.toFixed(3)}, groundedY=${groundedY.toFixed(3)}, shadowY=${shadowY.toFixed(3)}`
                );

                setModel(object);
                onModelLoad();
            },
            undefined,
            (err) => console.error("Model loading error:", err)
        );

        return () => { draco.dispose() };
    }, [modelPath]);

    /* ------------------------------------------------
        UPDATE MODEL COLOR
    -------------------------------------------------- */
    useEffect(() => {
        if (!model) return;

        model.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const mat = child.material.clone();
                if ("color" in mat) {
                    mat.color = new THREE.Color(modelColor);
                    mat.needsUpdate = true;
                }
                child.material = mat;
            }
        });
    }, [model, modelColor]);

    /* ------------------------------------------------
        APPLY DECAL TEXTURE
    -------------------------------------------------- */
    useEffect(() => {
        if (!model || !decalImage) return;

        const texLoader = new THREE.TextureLoader();
        texLoader.load(decalImage, (tex) => {
            model.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    child.material.map = tex;
                    child.material.needsUpdate = true;
                }
            });
        });
    }, [model, decalImage]);

    /* ------------------------------------------------
        RETURN MODEL — no effects altering scene graph
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
    decalImage: string | null;
    backgroundColor?: string;
    onModelLoad: () => void;
}

export default function Scene3D({
    modelPath,
    modelColor,
    decalImage,
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
                    decalImage={decalImage}
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







