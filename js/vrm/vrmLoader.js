import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — VRM & VRMA Loader
 * Exact POSIX casing, encodeURIComponent for spaces,
 * isolated animation failures, VRMA skeleton binding.
 * ═══════════════════════════════════════════════════════════
 */

export class VRMLoader {
    constructor() {
        this.loader = new GLTFLoader();
        this.loader.register((parser) => new VRMLoaderPlugin(parser));
        this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

        this.basePath = '/assets/';

        this.avatarFile = 'reina.vrm';

        this.animationFiles = [
            'idle.vrma',
            'talking.vrma',
            'angry.vrma',
            'sad.vrma',
            'welcome.vrma',
            'kiss.vrma',
            'sit.vrma',
            'Yawn.vrma',
            'Bashful.vrma',
            'Hand Raising.vrma'
        ];
    }

    buildAssetUrl(filename) {
        const encodedFilename = encodeURI(filename);
        return `${this.basePath}${encodedFilename}`;
    }

    normalizeClipKey(filename) {
        return filename.replace('.vrma', '').toLowerCase().replace(/\s+/g, '_');
    }

    bindVRMAnimationClip(vrmAnimation, vrmInstance, filename) {
        if (typeof vrmAnimation.createAnimationClip === 'function') {
            return vrmAnimation.createAnimationClip(vrmInstance);
        }
        return createVRMAnimationClip(vrmAnimation, vrmInstance);
    }

    async loadAll(onProgress) {
        console.log('[VRMLoader] Memulai proses muat aset...');
        const totalItems = this.animationFiles.length + 1;
        let loadedItems = 0;

        const tick = (label) => {
            loadedItems++;
            console.log(`[VRMLoader] Loaded: ${label} (${loadedItems}/${totalItems})`);
            if (onProgress) onProgress(loadedItems / totalItems);
        };

        try {
            const vrm = await this.loadVRM(this.avatarFile);
            tick(this.avatarFile);

            vrm.scene.traverse((obj) => {
                obj.frustumCulled = false;
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
            vrm.scene.rotation.y = Math.PI;
            vrm.scene.updateMatrixWorld(true);

            const clips = new Map();

            const tasks = this.animationFiles.map((filename) =>
                (async () => {
                    try {
                        const clip = await this.loadVRMA(filename, vrm);
                        const key = this.normalizeClipKey(filename);
                        clip.name = key;
                        clips.set(key, clip);
                        tick(filename);
                    } catch (err) {
                        const url = this.buildAssetUrl(filename);
                        console.error(
                            `[VRMLoader] Failed to fetch ${filename} at ${url} — ${err.message}`
                        );
                        tick(filename);
                    }
                })()
            );

            await Promise.allSettled(tasks);

            if (!clips.has('idle')) {
                throw new Error("[VRMLoader] 'idle.vrma' wajib ada — inisialisasi avatar gagal.");
            }

            console.log(`[VRMLoader] Selesai: ${clips.size}/${this.animationFiles.length} animasi.`);
            return { vrm, clips };
        } catch (error) {
            console.error('[VRMLoader] FATAL:', error);
            throw error;
        }
    }

    async fetchAssetBuffer(filename) {
        const url = this.buildAssetUrl(filename);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Status ${response.status}`);
            }
            return { url, buffer: await response.arrayBuffer() };
        } catch (error) {
            throw new Error(
                `[VRMLoader] Failed to fetch ${filename} at ${url} — ${error.message}`
            );
        }
    }

    async loadVRM(filename) {
        const { url, buffer } = await this.fetchAssetBuffer(filename);

        return new Promise((resolve, reject) => {
            try {
                this.loader.parse(
                    buffer,
                    url,
                    (gltf) => {
                        const vrm = gltf.userData.vrm;
                        if (!vrm) {
                            reject(new Error(`[VRMLoader] Bukan file VRM valid: ${filename}`));
                            return;
                        }
                        resolve(vrm);
                    },
                    (err) => reject(new Error(`[VRMLoader] Parse VRM gagal: ${err.message || err}`))
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    async loadVRMA(filename, vrmInstance) {
        const { url, buffer } = await this.fetchAssetBuffer(filename);

        return new Promise((resolve, reject) => {
            try {
                this.loader.parse(
                    buffer,
                    url,
                    (gltf) => {
                        const vrmAnimation = gltf.userData.vrmAnimation;
                        if (!vrmAnimation) {
                            reject(
                                new Error(
                                    `[VRMLoader] Tidak ada VRMAnimation di ${filename}`
                                )
                            );
                            return;
                        }

                        const clip = this.bindVRMAnimationClip(
                            vrmAnimation,
                            vrmInstance,
                            filename
                        );
                        resolve(clip);
                    },
                    (err) =>
                        reject(
                            new Error(`[VRMLoader] Parse VRMA gagal (${filename}): ${err.message || err}`)
                        )
                );
            } catch (err) {
                reject(err);
            }
        });
    }
}
