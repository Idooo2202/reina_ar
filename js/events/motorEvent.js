import * as THREE from 'three';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Motor Event Logic
 * Handles the "naik motor" sequence, generating a procedural
 * motorcycle and animating it across the AR floor.
 * ═══════════════════════════════════════════════════════════
 */

export class MotorEvent {
    constructor(scene, vrm, animationManager) {
        this.scene = scene;
        this.vrm = vrm;
        this.animationManager = animationManager;
        
        this.isActive = false;
        this.motorcycle = null;
        
        this.time = 0;
        this.startPos = new THREE.Vector3();
    }

    /**
     * Check if the message triggers the motor event
     */
    checkTrigger(message) {
        const lowerMsg = message.toLowerCase();
        return lowerMsg.includes('naik motor') || lowerMsg.includes('motoran');
    }

    /**
     * Starts the motor sequence
     */
    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.time = 0;

        // Save starting position based on current VRM position
        this.startPos.copy(this.vrm.scene.position);

        // 1. Create Motorcycle Mesh
        this.createMotorcycle();
        
        // 2. Position motorcycle at VRM location
        this.motorcycle.position.copy(this.startPos);
        this.scene.add(this.motorcycle);

        // 3. Attach VRM to Motorcycle
        // Adjust Y offset so Reina sits on the seat
        this.vrm.scene.position.set(0, 0.45, 0); 
        this.motorcycle.add(this.vrm.scene);

        // 4. Trigger sitting animation
        this.animationManager.playState('sit', true);
    }

    /**
     * Generates a procedural, stylized motorcycle using primitives
     */
    createMotorcycle() {
        this.motorcycle = new THREE.Group();

        // Main body (Box)
        const bodyGeo = new THREE.BoxGeometry(0.3, 0.4, 1.2);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.35;
        this.motorcycle.add(body);

        // Accent strip
        const accentGeo = new THREE.BoxGeometry(0.32, 0.05, 1.0);
        const accentMat = new THREE.MeshStandardMaterial({ color: 0xe040fb, emissive: 0xe040fb, emissiveIntensity: 0.5 });
        const accent = new THREE.Mesh(accentGeo, accentMat);
        accent.position.y = 0.5;
        this.motorcycle.add(accent);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 32);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
        
        const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
        frontWheel.position.set(0, 0.25, 0.6);
        this.motorcycle.add(frontWheel);

        const backWheel = new THREE.Mesh(wheelGeo, wheelMat);
        backWheel.position.set(0, 0.25, -0.6);
        this.motorcycle.add(backWheel);
        
        // Headlight
        const lightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16);
        lightGeo.rotateX(Math.PI / 2);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(0, 0.5, 0.85);
        this.motorcycle.add(light);
    }

    /**
     * Ends the motor sequence and cleans up
     */
    stop() {
        if (!this.isActive) return;
        this.isActive = false;

        // Detach VRM and put back in scene at motorcycle's current world position
        const worldPos = new THREE.Vector3();
        this.vrm.scene.getWorldPosition(worldPos);
        worldPos.y = this.startPos.y; // Keep it on the floor
        
        this.scene.add(this.vrm.scene);
        this.vrm.scene.position.copy(worldPos);
        
        // Remove motorcycle
        this.scene.remove(this.motorcycle);
        this.motorcycle = null;

        // Back to idle
        this.animationManager.playIdle();
    }

    /**
     * Updates the motor animation per frame
     */
    update(delta) {
        if (!this.isActive || !this.motorcycle) return;

        this.time += delta;

        // Simple sinusoidal path movement
        const speed = 1.2; // meters per second
        const radius = 1.5; // meters
        
        // Calculate new position
        const angle = this.time * speed;
        const x = this.startPos.x + Math.sin(angle) * radius;
        const z = this.startPos.z + Math.cos(angle) * radius - radius;
        
        this.motorcycle.position.x = x;
        this.motorcycle.position.z = z;
        
        // Calculate rotation based on velocity vector
        const dx = Math.cos(angle) * radius * speed;
        const dz = -Math.sin(angle) * radius * speed;
        const targetRotation = Math.atan2(dx, dz);
        
        // Smooth rotation
        this.motorcycle.rotation.y = targetRotation;

        // Stop sequence after a full circle (~8 seconds)
        if (angle > Math.PI * 2) {
            this.stop();
        }
    }
}
