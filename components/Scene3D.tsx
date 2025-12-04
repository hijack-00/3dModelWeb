'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
// import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

interface Model3DProps {
    modelPath: string;
    modelColor: string;
    decalImage: string | null;
    onModelLoad: () => void;
}

function Model3D({ modelPath, modelColor, decalImage, onModelLoad }: Model3DProps) {
    const meshRef = useRef<THREE.Group>(null);
    const [model, setModel] = useState<THREE.Group | null>(null);
    const { scene } = useThree();

    // Load the GLB model
    useEffect(() => {
        const loader = new GLTFLoader();

        // Setup DRACOLoader
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);

        loader.load(
            modelPath,
            (gltf) => {
                const loadedModel = gltf.scene;

                // Center and scale model
                const box = new THREE.Box3().setFromObject(loadedModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                // Center horizontally but place on ground
                loadedModel.position.x = -center.x;
                loadedModel.position.z = -center.z;
                loadedModel.position.y = -box.min.y; // Place model on ground (y=0)

                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim;
                loadedModel.scale.multiplyScalar(scale);

                // Adjust position after scaling to ensure it stays on ground
                const newBox = new THREE.Box3().setFromObject(loadedModel);
                loadedModel.position.y = -newBox.min.y - 1.3;

                setModel(loadedModel);
                onModelLoad();
            },
            (progress) => {
                const percentComplete = (progress.loaded / progress.total) * 100;
                console.log(`Loading: ${percentComplete.toFixed(0)}%`);
            },
            (error) => {
                console.error('Error loading model:', error);
            }
        );

        return () => {
            dracoLoader.dispose();
        };
    }, [modelPath, onModelLoad]);


    // useEffect(() => {
    //     if (!model) return;

    //     model.traverse((child) => {
    //         if (child instanceof THREE.Mesh && child.material) {
    //             const orig = child.material as THREE.MeshStandardMaterial;
    //             const material = orig.clone();

    //             // If the material already has a map, keep the map and set color to white
    //             if (material.map) {
    //                 material.color = new THREE.Color('#ffffff');
    //             } else {
    //                 material.color = new THREE.Color(modelColor);
    //             }

    //             material.needsUpdate = true;
    //             child.material = material;
    //         }
    //     });
    // }, [model, modelColor]);

    // // Apply baked/decal texture (uses provided decalImage or falls back to baked file)
    // useEffect(() => {
    //     if (!model) return;

    //     const bakedPath = '/textures/Oversized_Baked.jpg';
    //     const imageToUse = decalImage ?? bakedPath;

    //     const textureLoader = new THREE.TextureLoader();
    //     textureLoader.load(
    //         imageToUse,
    //         (texture) => {
    //             // Correct color space for sRGB textures (JPG/PNG)
    //             if ('sRGBEncoding' in THREE) {
    //                 texture.encoding = (THREE as any).sRGBEncoding;
    //             }

    //             // If your texture looks upside-down, toggle flipY:
    //             // texture.flipY = false;

    //             // Optional: adjust scale/offset to match the model's UV scale
    //             texture.wrapS = THREE.RepeatWrapping;
    //             texture.wrapT = THREE.RepeatWrapping;
    //             texture.repeat.set(1, 1);
    //             texture.offset.set(0, 0);
    //             texture.needsUpdate = true;

    //             // Try to apply to top meshes by name; if none found, apply to all
    //             let appliedToTop = false;
    //             model.traverse((child) => {
    //                 if (child instanceof THREE.Mesh) {
    //                     const name = (child.name || '').toLowerCase();
    //                     const looksLikeTop = name.includes('top') || name.includes('front') || name.includes('layer') || name.includes('oversized') || name.includes('body');

    //                     if (looksLikeTop) {
    //                         appliedToTop = true;
    //                         const mat = (child.material as THREE.MeshStandardMaterial).clone();
    //                         mat.map = texture;
    //                         mat.color = new THREE.Color('#ffffff');
    //                         mat.needsUpdate = true;
    //                         child.material = mat;
    //                     }
    //                 }
    //             });

    //             if (!appliedToTop) {
    //                 model.traverse((child) => {
    //                     if (child instanceof THREE.Mesh) {
    //                         const mat = (child.material as THREE.MeshStandardMaterial).clone();
    //                         mat.map = texture;
    //                         mat.color = new THREE.Color('#ffffff');
    //                         mat.needsUpdate = true;
    //                         child.material = mat;
    //                     }
    //                 });
    //             }
    //         },
    //         undefined,
    //         (err) => {
    //             console.error('Error loading texture', imageToUse, err);
    //         }
    //     );
    // }, [model, decalImage]);    

    // Update model color
    useEffect(() => {
        if (!model) return;

        model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = child.material.clone();

                if (material instanceof THREE.MeshStandardMaterial) {
                    material.color = new THREE.Color(modelColor);
                    material.needsUpdate = true;
                }

                child.material = material;
            }
        });
    }, [model, modelColor]);

    // Apply decal texture
    //     useEffect(() => {
    //     if (!model) return;

    //     const bakedPath = '/textures/Oversized_Baked.jpg';
    //     const imageToUse = decalImage ?? bakedPath;

    //     const textureLoader = new THREE.TextureLoader();
    //     textureLoader.load(
    //         imageToUse,
    //         (texture) => {
    //             // Ensure correct color space for JPG/PNG sRGB images
    //             if ((THREE as any).sRGBEncoding) {
    //                 texture.encoding = THREE.sRGBEncoding;
    //             } else if ((THREE as any).SRGBColorSpace) {
    //                 texture.colorSpace = (THREE as any).SRGBColorSpace;
    //             }

    //             // Improve texture quality
    //             texture.anisotropy = (texture?.anisotropy ?? 1) || 1;
    //             texture.wrapS = THREE.RepeatWrapping;
    //             texture.wrapT = THREE.RepeatWrapping;

    //             // If your model UVs expect no vertical flip, you can try:
    //             // texture.flipY = false;

    //             // Try to target only the "top" mesh(s) by name; if none found, apply to all.
    //             let topFound = false;
    //             model.traverse((child) => {
    //                 if (child instanceof THREE.Mesh) {
    //                     const name = (child.name || '').toLowerCase();
    //                     const isTop = name.includes('top') || name.includes('layer_top') || name.includes('oversized_top');

    //                     if (isTop) {
    //                         topFound = true;
    //                         const mat = (child.material as THREE.MeshStandardMaterial).clone();
    //                         mat.map = texture;
    //                         mat.needsUpdate = true;
    //                         child.material = mat;
    //                     }
    //                 }
    //             });

    //             if (!topFound) {
    //                 // Fallback = apply to all meshes
    //                 model.traverse((child) => {
    //                     if (child instanceof THREE.Mesh) {
    //                         const mat = (child.material as THREE.MeshStandardMaterial).clone();
    //                         mat.map = texture;
    //                         mat.needsUpdate = true;
    //                         child.material = mat;
    //                     }
    //                 });
    //             }
    //         },
    //         undefined,
    //         (err) => {
    //             console.error('Error loading texture', imageToUse, err);
    //         }
    //     );
    // }, [model, decalImage]);
    //     useEffect(() => {
    //     if (!model || !decalImage) return;
    //     const textureLoader = new THREE.TextureLoader();
    //     textureLoader.load(decalImage, (texture) => {
    //         // Ensure correct color space for JPG/PNG sRGB images
    //         if ((THREE as any).sRGBEncoding) {
    //             texture.encoding = THREE.sRGBEncoding;
    //         } else if ((THREE as any).SRGBColorSpace) {
    //             texture.colorSpace = (THREE as any).SRGBColorSpace;
    //         }

    //         // Optionally flip depending on your model's UV orientation:
    //         // texture.flipY = false;

    //         // Apply only to the "top" mesh if names indicate it; otherwise apply to all.
    //         const applyOnlyTop = true; // set false to always apply to every mesh
    //         model.traverse((child) => {
    //             if (child instanceof THREE.Mesh && child.material) {
    //                 const name = (child.name || '').toLowerCase();
    //                 const isTop = name.includes('top') || name.includes('layer_top') || name.includes('oversized_top');

    //                 if (!applyOnlyTop || isTop) {
    //                     const material = (child.material as THREE.MeshStandardMaterial).clone();
    //                     material.map = texture;
    //                     material.needsUpdate = true;
    //                     child.material = material;
    //                 }
    //             }
    //         });
    //     });
    // }, [model, decalImage]);


    useEffect(() => {
        if (!model || !decalImage) return;

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(decalImage, (texture) => {
            model.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const material = child.material as THREE.MeshStandardMaterial;
                    material.map = texture;
                    material.needsUpdate = true;
                }
            });
        });
    }, [model, decalImage]);

    // Add model to scene
    useEffect(() => {
        if (model && meshRef.current) {
            meshRef.current.add(model);
            return () => {
                meshRef.current?.remove(model);
            };
        }
    }, [model]);

    return <group ref={meshRef} />;
}

interface Scene3DProps {
    modelPath: string;
    modelColor: string;
    decalImage: string | null;
    backgroundColor?: string;
    onModelLoad: () => void;
}

// export default function Scene3D({ modelPath, modelColor, decalImage, onModelLoad }: Scene3DProps) {
export default function Scene3D({ modelPath, modelColor, decalImage, backgroundColor = '#212121', onModelLoad }: Scene3DProps) {

    return (
        <div className="w-full h-full">
            <Canvas shadows>
                {/* Background Color */}
                <color attach="background" args={[backgroundColor]} />

                <PerspectiveCamera makeDefault position={[0, 0, 5]} />

                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Model3D
                    modelPath={modelPath}
                    modelColor={modelColor}
                    decalImage={decalImage}
                    onModelLoad={onModelLoad}
                />

                <Environment preset="studio" />
                <ContactShadows position={[0, -0.9, 0]} opacity={0.5} scale={10} blur={2} far={10} />
                <OrbitControls enablePan enableZoom enableRotate minDistance={2} maxDistance={10} />
            </Canvas>
        </div>
    );
}
