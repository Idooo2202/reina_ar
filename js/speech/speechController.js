import { VRMExpressionPresetName } from '@pixiv/three-vrm';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Speech Controller (STT + Lip-Sync)
 * STT via webkitSpeechRecognition (id-ID).
 * Lip-sync viseme smoothing driven by TTS onboundary events.
 * 🚀 BARU: Mode hands-free (continuous + wake-word) buat naik motor.
 * ═══════════════════════════════════════════════════════════
 */

const VISEME_PRESETS = {
    aa: VRMExpressionPresetName.Aa,
    ih: VRMExpressionPresetName.Ih,
    ou: VRMExpressionPresetName.Ou,
    ee: VRMExpressionPresetName.Ee,
    oh: VRMExpressionPresetName.Oh
};

const VOWEL_TO_VISEME = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh' };

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
        this.onWakeWordDetected = null; // 🚀 hook opsional buat feedback UI ("Reina dengar!")
        this.onIgnored = null;          // 🚀 hook opsional pas ada suara tapi bukan wake word

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
        this.recognition.continuous = false; // tetap false — browser mobile sering gak stabil kalau true, kita handle restart manual
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            console.log(`[SpeechController] STT: "${transcript}"`);
            this.isListening = false;

            if (this.handsFreeMode) {
                // 🚀 Mode hands-free: cuma diproses kalau ada wake word
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
            // 'no-speech' itu normal banget di mode hands-free (nunggu suara terus) — jangan spam error ke UI
            if (this.onListenError && !(this.handsFreeMode && event.error === 'no-speech')) {
                this.onListenError(event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onListenEnd) this.onListenEnd();

            // 🚀 Auto-restart terus-menerus selama mode hands-free aktif & belum dimatikan manual
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
        if (this.isListening) return; // udah jalan, gak perlu restart
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

    /**
     * 🚀 BARU: Aktifkan mode hands-free — selalu dengerin, cuma proses ucapan yang ada wake word-nya.
     * Cocok buat skenario naik motor (tangan sibuk di setang, gak bisa tap layar).
     * @param {string[]} wakeWords - daftar kata pemanggil, misal ['reina', 'sayang']
     */
    startHandsFreeMode(wakeWords = ['reina']) {
        if (!this.recognition) return false;
        this._wakeWords = wakeWords;
        this.handsFreeMode = true;
        this._manualStop = false;
        this._restartRecognition();
        console.log('[SpeechController] Mode hands-free AKTIF. Wake words:', wakeWords);
        return true;
    }

    /**
     * 🚀 BARU: Matikan mode hands-free, balik ke tap-to-talk manual.
     */
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

    handleBoundary(event, fullText) {
        if (event.charIndex == null) return;

        if (event.name === 'word') {
            const word = fullText.substring(
                event.charIndex,
                event.charIndex + (event.charLength || 0)
            );
            this._setVisemeFromWord(word);
        } else {
            this._setVisemeFromChar(fullText.charAt(event.charIndex));
        }
    }

    _setVisemeFromChar(char) {
        const viseme = VOWEL_TO_VISEME[char.toLowerCase()];
        if (!viseme) return;
        for (const key of this.visemeKeys) {
            this.visemeTargets[key] = key === viseme ? 1.0 : 0.0;
        }
    }

    _setVisemeFromWord(word) {
        const lower = word.toLowerCase();
        let viseme = null;

        for (let i = lower.length - 1; i >= 0; i--) {
            if (VOWEL_TO_VISEME[lower[i]]) {
                viseme = VOWEL_TO_VISEME[lower[i]];
                break;
            }
        }
        if (!viseme) {
            for (let i = 0; i < lower.length; i++) {
                if (VOWEL_TO_VISEME[lower[i]]) {
                    viseme = VOWEL_TO_VISEME[lower[i]];
                    break;
                }
            }
        }
        if (viseme) {
            for (const key of this.visemeKeys) {
                this.visemeTargets[key] = key === viseme ? 0.85 : 0.0;
            }
        }
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