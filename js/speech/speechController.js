import { VRMExpressionPresetName } from '@pixiv/three-vrm';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Speech Controller (STT + Lip-Sync)
 * STT via webkitSpeechRecognition (id-ID).
 * 🚀 GANTI: Lip-sync sekarang berbasis volume audio real-time
 * (bukan lagi prediksi dari huruf/kata), karena TikTok TTS
 * gak punya event word-boundary kayak speechSynthesis.
 * Mode hands-free (continuous + wake-word) buat naik motor.
 * ═══════════════════════════════════════════════════════════
 */

const VISEME_PRESETS = {
    aa: VRMExpressionPresetName.Aa,
    ih: VRMExpressionPresetName.Ih,
    ou: VRMExpressionPresetName.Ou,
    ee: VRMExpressionPresetName.Ee,
    oh: VRMExpressionPresetName.Oh
};

export class SpeechController {
    constructor(vrm) {
        this.vrm = vrm;
        this.recognition = null;
        this.isListening = false;

        // 🚀 STATE MODE HANDS-FREE
        this.handsFreeMode = false;
        this._manualStop = false;
        this._wakeWords = [];

        this.visemeKeys = Object.keys(VISEME_PRESETS);
        this.visemeTargets = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        this.visemeCurrent = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        this.smoothingSpeed = 14;

        this.onTranscript = null;
        this.onListenError = null;
        this.onListenEnd = null;
        this.onWakeWordDetected = null;
        this.onIgnored = null;

        this._initSTT();
    }

    _initSTT() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('[SpeechController] STT tidak tersedia.');
            return;
        }

        this.recognition = new SR();
        this.recognition.lang = 'id-ID';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            console.log(`[SpeechController] STT: "${transcript}"`);
            this.isListening = false;

            if (this.handsFreeMode) {
                if (this._cekWakeWord(transcript)) {
                    if (this.onWakeWordDetected) this.onWakeWordDetected(transcript);
                    if (this.onTranscript && transcript) this.onTranscript(transcript);
                } else {
                    console.log('[SpeechController] Diabaikan (tanpa wake word):', transcript);
                    if (this.onIgnored) this.onIgnored(transcript);
                }
            } else {
                if (this.onTranscript && transcript) this.onTranscript(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error(`[SpeechController] STT error: ${event.error}`);
            this.isListening = false;
            if (this.onListenError && !(this.handsFreeMode && event.error === 'no-speech')) {
                this.onListenError(event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onListenEnd) this.onListenEnd();

            if (this.handsFreeMode && !this._manualStop) {
                setTimeout(() => {
                    if (this.handsFreeMode && !this._manualStop) {
                        this._restartRecognition();
                    }
                }, 300);
            }
        };
    }

    _cekWakeWord(teks) {
        const lower = teks.toLowerCase();
        return this._wakeWords.some((kata) => lower.includes(kata.toLowerCase()));
    }

    _restartRecognition() {
        if (this.isListening) return;
        try {
            this.recognition.start();
            this.isListening = true;
        } catch (error) {
            console.warn('[SpeechController] Restart gagal, coba lagi sebentar:', error.message);
            setTimeout(() => {
                if (this.handsFreeMode && !this._manualStop) this._restartRecognition();
            }, 500);
        }
    }

    isSTTSupported() {
        return this.recognition !== null;
    }

    startHandsFreeMode(wakeWords = ['reina']) {
        if (!this.recognition) return false;
        this._wakeWords = wakeWords;
        this.handsFreeMode = true;
        this._manualStop = false;
        this._restartRecognition();
        console.log('[SpeechController] Mode hands-free AKTIF. Wake words:', wakeWords);
        return true;
    }

    stopHandsFreeMode() {
        this.handsFreeMode = false;
        this._manualStop = true;
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        console.log('[SpeechController] Mode hands-free NONAKTIF.');
    }

    startListening() {
        if (!this.recognition || this.isListening) return false;
        try {
            this.recognition.start();
            this.isListening = true;
            return true;
        } catch (error) {
            console.error('[SpeechController] Gagal start STT:', error);
            return false;
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }

    /**
     * 🚀 BARU: Set target viseme dari level volume audio real-time (0-1).
     * Dipanggil tiap frame dari main.js selagi apiService.isSpeaking() true.
     */
    setAmplitudeViseme(volume) {
        const v = Math.max(0, Math.min(1, volume));
        this.visemeTargets.aa = v;
        this.visemeTargets.ih = v * 0.3;
        this.visemeTargets.ou = v * 0.15;
        this.visemeTargets.ee = 0;
        this.visemeTargets.oh = 0;
    }

    resetVisemes() {
        for (const key of this.visemeKeys) {
            this.visemeTargets[key] = 0.0;
        }
    }

    update(delta) {
        const em = this.vrm?.expressionManager;
        if (!em) return;

        const factor = 1 - Math.exp(-this.smoothingSpeed * delta);
        for (const key of this.visemeKeys) {
            this.visemeCurrent[key] += (this.visemeTargets[key] - this.visemeCurrent[key]) * factor;
            em.setValue(VISEME_PRESETS[key], this.visemeCurrent[key]);
        }
    }
}