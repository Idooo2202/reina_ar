/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Gemini API Service + TikTok TTS Engine
 * Autonomous expression-tag prompting, TikTok TTS (id_001),
 * AudioContext unlock on user gesture, volume-based lip-sync
 * (AnalyserNode) buat animationManager sync.
 * 🚀 GANTI: dari window.speechSynthesis (robotic) ke TikTok TTS.
 * ═══════════════════════════════════════════════════════════
 */

export class ApiService {
    constructor() {
        this.apiKey = localStorage.getItem('reina_api_key') || '';
        this.endpoint =
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=';

        // 🚀 BARU: endpoint TikTok TTS (sama kayak yang dipakai Reina PC)
        this.ttsEndpoint = 'https://tiktok-tts.weilnet.workers.dev/api/generation';
        this.ttsVoice = 'id_001';

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
        this._audioContext = null;
        this._analyserNode = null;
        this._analyserDataArray = null;
        this._currentSource = null;
        this._isSpeaking = false;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('reina_api_key', key);
    }

    isConfigured() {
        return this.apiKey.length > 0;
    }

    /**
     * Unlocks AudioContext di mobile (butuh user gesture pertama).
     */
    unlockSpeech() {
        if (this._speechUnlocked) return;

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx && !this._audioContext) {
                this._audioContext = new AudioCtx();
                this._analyserNode = this._audioContext.createAnalyser();
                this._analyserNode.fftSize = 256;
                this._analyserNode.connect(this._audioContext.destination);
                this._analyserDataArray = new Uint8Array(this._analyserNode.frequencyBinCount);
            }

            if (this._audioContext.state === 'suspended') {
                this._audioContext.resume();
            }

            this._speechUnlocked = true;
            console.log('[ApiService] AudioContext unlocked.');
        } catch (error) {
            console.error('[ApiService] Gagal unlock audio:', error);
        }
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
     * 🚀 BARU: Fetch audio dari TikTok TTS, return base64 mp3.
     */
    async _fetchTikTokAudio(text) {
        const response = await fetch(this.ttsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: this.ttsVoice })
        });

        if (!response.ok) {
            throw new Error(`TikTok TTS HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.data) {
            throw new Error('TikTok TTS: tidak ada audio yang dikembalikan (mungkin teks terlalu panjang/kosong).');
        }

        return data.data;
    }

    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Speaks via TikTok TTS, syncing animation + lip-sync berbasis volume audio.
     * @param {string} text
     * @param {import('../vrm/animationManager.js').AnimationManager|null} animationManager
     * @param {{ onComplete?: Function }} hooks
     */
    async speak(text, animationManager = null, hooks = {}) {
        if (!text) return;

        this.unlockSpeech();
        this.stopSpeaking(animationManager);

        try {
            const base64Audio = await this._fetchTikTokAudio(text);
            const arrayBuffer = this._base64ToArrayBuffer(base64Audio);
            const audioBuffer = await this._audioContext.decodeAudioData(arrayBuffer);

            const source = this._audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this._analyserNode);

            this._currentSource = source;
            this._isSpeaking = true;

            console.log('[ApiService] TTS (TikTok) started.');
            if (animationManager) animationManager.onTTSStart();

            source.onended = () => {
                console.log('[ApiService] TTS (TikTok) ended.');
                this._isSpeaking = false;
                this._currentSource = null;
                if (animationManager) animationManager.onTTSEnd();
                if (hooks.onComplete) hooks.onComplete();
            };

            source.start(0);
        } catch (error) {
            console.error('[ApiService] TTS gagal:', error);
            this._isSpeaking = false;
            this._currentSource = null;
            if (animationManager) animationManager.onTTSEnd();
            if (hooks.onComplete) hooks.onComplete();
        }
    }

    stopSpeaking(animationManager = null) {
        if (this._currentSource) {
            try {
                this._currentSource.stop();
            } catch (_) {
                // udah berhenti/belum sempat mulai — aman diabaikan
            }
            this._currentSource = null;
        }
        this._isSpeaking = false;
        if (animationManager) animationManager.onTTSEnd();
    }

    isSpeaking() {
        return this._isSpeaking;
    }

    /**
     * 🚀 BARU: Level volume real-time (0-1) dari audio yang lagi diputar.
     * Dipanggil tiap frame dari render loop main.js buat drive lip-sync.
     */
    getVolumeLevel() {
        if (!this._analyserNode || !this._isSpeaking) return 0;

        this._analyserNode.getByteFrequencyData(this._analyserDataArray);

        let sum = 0;
        for (let i = 0; i < this._analyserDataArray.length; i++) {
            sum += this._analyserDataArray[i];
        }
        const average = sum / this._analyserDataArray.length;
        return Math.min(average / 100, 1.0);
    }
}