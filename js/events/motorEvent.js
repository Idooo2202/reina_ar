/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Motor Event Logic (MOTOR ASLI, bukan virtual)
 * Menemani lewat AR pas kamu naik motor beneran — HP di-mounting
 * di setang/spion. TIDAK ADA mesh motor virtual, TIDAK ADA gerakan
 * scripted. "Jalan"-nya dateng natural dari kamera HP yang ikut
 * bergerak sungguhan pas motor jalan (WebXR tracking dunia nyata).
 * ═══════════════════════════════════════════════════════════
 */

export class MotorEvent {
    constructor(scene, vrm, animationManager) {
        this.scene = scene; // disimpan buat kompatibilitas constructor, gak dipakai lagi buat mesh
        this.vrm = vrm;
        this.animationManager = animationManager;

        this.isRiding = false;
    }

    /** Deteksi frasa lewat chat/suara buat NYALAIN mode berkendara */
    checkTrigger(message) {
        if (!message) return false;
        const lower = message.toLowerCase();
        return (lower.includes('naik motor') || lower.includes('motoran')) && !this.isRiding;
    }

    /** Deteksi frasa lewat chat/suara buat MATIIN mode berkendara */
    checkStopTrigger(message) {
        if (!message) return false;
        const lower = message.toLowerCase();
        return (
            (lower.includes('turun motor') ||
                lower.includes('udah sampai') ||
                lower.includes('berhenti motor') ||
                lower.includes('selesai motoran')) &&
            this.isRiding
        );
    }

    /**
     * Dipanggil dari toggle tombol "Mode Berkendara" di main.js,
     * ATAU otomatis dari chat/suara lewat checkTrigger/checkStopTrigger.
     */
    setRideMode(aktif) {
        if (aktif) {
            this.startRide();
        } else {
            this.stopRide();
        }
    }

    startRide() {
        if (this.isRiding) return;
        this.isRiding = true;

        // Cukup kunci pose duduk terus-menerus. Gak ada mesh/gerakan virtual —
        // sensasi "jalan"-nya dateng natural dari kamera HP yang beneran ikut gerak.
        this.animationManager.playState('sit', true);
        console.log('[MotorEvent] Mode berkendara AKTIF — pose duduk dikunci.');
    }

    stopRide() {
        if (!this.isRiding) return;
        this.isRiding = false;

        this.animationManager.playIdle();
        console.log('[MotorEvent] Mode berkendara NONAKTIF — balik idle.');
    }

    /**
     * Dipanggil tiap frame dari render loop main.js.
     * Sengaja kosong — gak ada animasi/posisi yang perlu di-update tiap frame
     * lagi, karena gerakannya sepenuhnya dari device asli, bukan scripted.
     */
    update(delta) {
        // no-op
    }
}