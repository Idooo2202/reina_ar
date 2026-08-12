/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Gemini API Service + TTS Engine
 * Autonomous expression-tag prompting, Indonesian TTS,
 * audio unlock on user gesture, animationManager lip-sync hooks.
 * ═══════════════════════════════════════════════════════════
 */

export class ApiService {
    constructor() {
        this.apiKey = localStorage.getItem('reina_api_key') || '';
        this.endpoint =
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=';

        this.systemInstruction = `
Kamu adalah Reina, gadis anime virtual (Virtual Companion) di lingkungan Augmented Reality.
Kepribadianmu ceria, ramah, sedikit tsundere. Gunakan bahasa Indonesia santai, gaul, dan natural.

ATURAN EKSPRESI OTOMATIS (WAJIB):
Kamu adalah sutradara dirimu sendiri. Sisipkan tag emosi/aksi di MANA SAJA dalam balasan —
awal, tengah, atau akhir — sesuai ekspresi yang ingin kamu tunjukkan saat mengucapkan kalimat itu.
Kamu BOLEH menggunakan lebih dari satu tag jika emosi berubah dalam satu balasan.

Tag yang diizinkan (gunakan persis format kurung siku):
[idle]          — netral, diam
[talking]       — sedang bicara biasa
[welcome]       — sapa ramah, senang bertemu
[angry]         — marah, sebal, ngambek
[sad]           — sedih, kecewa
[kiss]          — cium jauh, tanda sayang
[Yawn]          — menguap, bosan, ngantuk
[Bashful]       — malu-malu, tersipu
[hand_raising]  — angkat tangan, panggil, tanya
[sit]           — duduk (naik motor, duduk bersantai)

Contoh 1 (tag di awal):
[welcome] Hai! Akhirnya kita ketemu lagi nih~

Contoh 2 (tag di tengah):
Hmm... [Bashful] jangan lihat aku gitu dong, malu tau!

Contoh 3 (tag berganti emosi):
[angry] Ih nyebelin! ... [sad] tapi gapapa deh, aku maafin kok.

Contoh 4:
[Yawn] Aduh ngantuk... tapi [talking] ceritain lagi dong, seru soalnya!

PENTING:
- Tag HANYA untuk animasi, jangan dibaca keras-keras — sisipkan natural dalam alur kalimat.
- Balasan singkat (1-3 kalimat), conversational.
- Pilih tag yang PALING akurat dengan emosi di momen itu.
`.trim();

        this._speechUnlocked = false;
        this._voices = [];
        this._currentUtterance = null;
        this._initVoices();
    }

    _initVoices() {
        const load = () => {
            this._voices = window.speechSynthesis?.getVoices() || [];
        };
        load();
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = load;
        }
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('reina_api_key', key);
    }

    isConfigured() {
        return this.apiKey.length > 0;
    }

    /**
     * Unlocks speechSynthesis + Web Audio on mobile (requires user gesture).
     */
    unlockSpeech() {
        if (this._speechUnlocked) return;

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const buffer = ctx.createBuffer(1, 1, 22050);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start(0);
                if (ctx.state === 'suspended') ctx.resume();
            }

            if (window.speechSynthesis?.paused) {
                window.speechSynthesis.resume();
            }

            const silent = new SpeechSynthesisUtterance('');
            silent.volume = 0;
            window.speechSynthesis?.speak(silent);
            window.speechSynthesis?.cancel();

            this._speechUnlocked = true;
            console.log('[ApiService] Speech synthesis unlocked.');
        } catch (error) {
            console.error('[ApiService] Gagal unlock speech:', error);
        }
    }

    _getIndonesianFemaleVoice() {
        const idVoices = this._voices.filter((v) => v.lang.toLowerCase().startsWith('id'));
        const female = idVoices.find(
            (v) =>
                v.name.toLowerCase().includes('female') ||
                v.name.toLowerCase().includes('perempuan') ||
                v.name.toLowerCase().includes('wanita')
        );
        return female || idVoices[0] || null;
    }

    async sendMessage(text) {
        if (!this.isConfigured()) {
            throw new Error('API Key belum diatur. Silakan buka menu Pengaturan.');
        }

        const url = `${this.endpoint}${this.apiKey}`;
        const payload = {
            systemInstruction: {
                parts: [{ text: this.systemInstruction }]
            },
            contents: [{ role: 'user', parts: [{ text }] }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let message = `HTTP Error: ${response.status}`;
            try {
                const errorData = await response.json();
                message = errorData.error?.message || message;
            } catch (_) { /* ignore */ }
            throw new Error(message);
        }

        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        throw new Error('Format respons dari API tidak sesuai yang diharapkan.');
    }

    /**
     * Speaks clean text via speechSynthesis, syncing animation + optional lip-sync.
     * @param {string} text
     * @param {import('../vrm/animationManager.js').AnimationManager|null} animationManager
     * @param {{ onBoundary?: Function, onComplete?: Function }} hooks
     */
    speak(text, animationManager = null, hooks = {}) {
        if (!text || !window.speechSynthesis) return;

        this.unlockSpeech();
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;

        const voice = this._getIndonesianFemaleVoice();
        if (voice) utterance.voice = voice;

        this._currentUtterance = utterance;

        utterance.onstart = () => {
            console.log('[ApiService] TTS started.');
            if (animationManager) animationManager.onTTSStart();
        };

        utterance.onboundary = (event) => {
            if (hooks.onBoundary) {
                hooks.onBoundary(event, text);
            }
        };

        utterance.onend = () => {
            console.log('[ApiService] TTS ended.');
            this._currentUtterance = null;
            if (animationManager) animationManager.onTTSEnd();
            if (hooks.onComplete) hooks.onComplete();
        };

        utterance.onerror = (event) => {
            console.error(`[ApiService] TTS error: ${event.error}`);
            this._currentUtterance = null;
            if (animationManager) animationManager.onTTSEnd();
            if (hooks.onComplete) hooks.onComplete();
        };

        window.speechSynthesis.speak(utterance);
    }

    stopSpeaking(animationManager = null) {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this._currentUtterance = null;
        if (animationManager) animationManager.onTTSEnd();
    }

    isSpeaking() {
        return window.speechSynthesis?.speaking ?? false;
    }
}
