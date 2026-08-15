import * as THREE from 'three';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — WebXR Manager
 * local reference space, hit-test reticle, avatar grounding
 * with matrixWorld sync and SpringBone momentum reset.
 * 🚀 FIX: onWindowResize sekarang skip kalau sesi XR lagi aktif —
 * renderer.setSize() gak boleh dipanggil pas WebXR presenting,
 * itu bikin warning berulang & berpotensi ganggu rendering (termasuk reticle).
 * ═══════════════════════════════════════════════════════════
 */

export class XRManager {
    constructor(canvasContainer) {
        this.container = canvasContainer;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.reticle = null;
        this.localSpace = null;

        this.isARActive = false;
        this.reticleVisible = false;

        this.onSelect = null;

        this.init();
    }

    init() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(2, 5, 2);
        this.scene.add(directionalLight);

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;

        this.renderer.xr.setReferenceSpaceType('local');

        this.container.appendChild(this.renderer.domElement);

        this.createReticle();

        const controller = this.renderer.xr.getController(0);
        controller.addEventListener('select', () => {
            if (this.reticle.visible && this.onSelect) {
                this.onSelect(this.reticle.matrix.clone());
            }
        });
        this.scene.add(controller);

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    createReticle() {
        const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xe040fb });
        this.reticle = new THREE.Mesh(ringGeo, ringMat);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    async requestSession() {
        if (!navigator.xr) {
            throw new Error('WebXR tidak didukung di browser ini.');
        }

        try {
            console.log('[XRManager] Meminta sesi immersive-ar...');
            const sessionInit = {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['local', 'dom-overlay'],
                domOverlay: { root: document.getElementById('overlay') }
            };

            const session = await navigator.xr.requestSession('immersive-ar', sessionInit);

            await this.renderer.xr.setSession(session);
            console.log('[XRManager] Sesi AR Berhasil Aktif!');

            this.isARActive = true;

            session.addEventListener('end', () => {
                console.log('[XRManager] Sesi AR Berakhir.');
                this.isARActive = false;
                this.hitTestSourceRequested = false;
                this.hitTestSource = null;
                this.localSpace = null;
            });

            return true;
        } catch (error) {
            console.error('[XRManager] Gagal memulai sesi AR:', error);
            throw error;
        }
    }

    updateHitTest(frame) {
        if (!frame) return;

        const session = this.renderer.xr.getSession();

        if (session && !this.hitTestSourceRequested) {
            console.log('[XRManager] Mengonfigurasi Hit Test Source (referenceSpace: local)...');

            session.requestReferenceSpace('local').then((referenceSpace) => {
                this.localSpace = referenceSpace;
                console.log('[XRManager] Reference Space (local) Siap.');

                session.requestReferenceSpace('viewer').then((viewerSpace) => {
                    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
                        this.hitTestSource = source;
                        console.log('[XRManager] Hit Test Source Siap.');
                    }).catch((err) => {
                        console.error('[XRManager] Gagal membuat Hit Test Source:', err);
                    });
                }).catch((err) => {
                    console.error('[XRManager] Gagal mendapatkan viewer reference space:', err);
                });
            }).catch((err) => {
                console.error('[XRManager] Gagal mendapatkan local reference space:', err);
            });

            this.hitTestSourceRequested = true;
        }

        if (this.hitTestSource && this.localSpace) {
            const hitTestResults = frame.getHitTestResults(this.hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(this.localSpace);

                if (pose) {
                    this.reticle.visible = true;
                    this.reticle.matrix.fromArray(pose.transform.matrix);
                    this.reticleVisible = true;
                }
            } else {
                this.reticle.visible = false;
                this.reticleVisible = false;
            }
        }
    }

    /**
     * Grounds the VRM avatar at the hit-test reticle matrix.
     * Forces matrixWorld recalculation and resets SpringBone momentum.
     */
    placeAvatarAtReticle(vrm, reticleMatrix, camera) {
        if (!vrm || !reticleMatrix) return;

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        reticleMatrix.decompose(position, quaternion, scale);

        vrm.scene.position.copy(position);
        vrm.scene.quaternion.copy(quaternion);

        const cameraPos = camera.position.clone();
        cameraPos.y = position.y;
        vrm.scene.lookAt(cameraPos);
        vrm.scene.rotateY(Math.PI);

        vrm.scene.updateMatrixWorld(true);

        if (vrm.springBoneManager) {
            vrm.springBoneManager.reset();
            console.log('[XRManager] SpringBone momentum direset setelah teleportasi avatar.');
        }
    }

    onWindowResize() {
        // 🚀 FIX: JANGAN panggil setSize() pas sesi XR lagi presenting —
        // ukuran canvas dikelola otomatis sama compositor WebXR selama sesi aktif.
        // Ini penyebab warning "Can't change size while VR device is presenting"
        // yang berulang-ulang, dan bisa ganggu rendering (termasuk reticle).
        if (this.renderer.xr.isPresenting) {
            return;
        }

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}