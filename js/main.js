import * as THREE from 'three';
import { XRManager } from './ar/xrManager.js';
import { VRMLoader } from './vrm/vrmLoader.js';
import { AnimationManager } from './vrm/animationManager.js';
import { SpeechController } from './speech/speechController.js';
import { ApiService } from './llm/apiService.js';
import { TagParser } from './llm/tagParser.js';
import { MotorEvent } from './events/motorEvent.js';

const MAX_DELTA = 0.1;

// 🚀 Kata pemanggil buat mode hands-free (mirror konsep dari Reina PC)
const WAKE_WORDS = ['reina', 'sayang', 'yang', 'beb', 'cinta'];

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Main Application Orchestrator
 * WebXR setAnimationLoop ONLY (no requestAnimationFrame),
 * STT mic input, TTS via ApiService, autonomous animation sync.
 * 🚀 BARU: Toggle Mode Berkendara (hands-free, buat naik motor).
 * ═══════════════════════════════════════════════════════════
 */

class App {
    constructor() {
        this.clock = new THREE.Clock();

        this.xrManager = null;
        this.vrmLoader = null;
        this.animationManager = null;
        this.speechController = null;
        this.apiService = new ApiService();
        this.tagParser = new TagParser();
        this.motorEvent = null;

        this.vrmObj = null;
        this.isPlaced = false;
        this.rideModeActive = false; // 🚀 state mode berkendara

        this.ui = {
            loadingScreen: document.getElementById('loading-screen'),
            loadingProgress: document.getElementById('progress-fill'),
            loadingText: document.getElementById('loading-text'),
            btnAR: document.getElementById('btn-ar'),
            arStatus: document.getElementById('ar-status'),
            statusText: document.getElementById('status-text'),
            chatInput: document.getElementById('chat-input'),
            btnSend: document.getElementById('btn-send'),
            btnMic: document.getElementById('btn-mic'),
            btnRideMode: document.getElementById('btn-ride-mode'), // 🚀 BARU
            chatMessages: document.getElementById('chat-messages'),
            btnSettings: document.getElementById('btn-settings'),
            modalSettings: document.getElementById('settings-modal'),
            btnCloseSettings: document.getElementById('btn-close-settings'),
            btnSaveSettings: document.getElementById('btn-save-settings'),
            apiKeyInput: document.getElementById('api-key-input')
        };

        this.init();
    }

    async init() {
        console.log('[App] Menginisialisasi Reina AR...');
        this.bindEvents();

        const canvasContainer = document.getElementById('canvas-container');
        this.xrManager = new XRManager(canvasContainer);
        this.vrmLoader = new VRMLoader();

        try {
            this.ui.loadingText.textContent = 'Memuat Reina dan Animasi...';

            const { vrm, clips } = await this.vrmLoader.loadAll((progress) => {
                this.ui.loadingProgress.style.width = `${progress * 100}%`;
            });

            this.vrmObj = vrm;
            this.animationManager = new AnimationManager(this.vrmObj, clips);
            this.animationManager.playIdle();

            this.speechController = new SpeechController(this.vrmObj);
            this.speechController.onTranscript = (transcript) => {
                this.ui.chatInput.value = transcript;
                this.handleChatSubmit();
            };
            this.speechController.onListenError = (code) => {
                if (code !== 'aborted' && code !== 'no-speech') {
                    this.addChatMessage('system', `STT error: ${code}`);
                }
                this.ui.btnMic?.classList.remove('listening');
            };
            this.speechController.onListenEnd = () => {
                if (!this.rideModeActive) {
                    this.ui.btnMic?.classList.remove('listening');
                }
            };
            // 🚀 BARU: feedback visual pas wake word kedengeran di mode berkendara
            this.speechController.onWakeWordDetected = (transcript) => {
                console.log('[App] Wake word terdeteksi:', transcript);
                this.ui.btnRideMode?.classList.add('wake-flash');
                setTimeout(() => this.ui.btnRideMode?.classList.remove('wake-flash'), 400);
            };

            this.motorEvent = new MotorEvent(
                this.xrManager.scene,
                this.vrmObj,
                this.animationManager
            );

            setTimeout(async () => {
                this.ui.loadingScreen.classList.add('fade-out');
                if (navigator.xr) {
                    try {
                        const ok = await navigator.xr.isSessionSupported('immersive-ar');
                        if (ok) {
                            this.ui.btnAR.classList.remove('hidden');
                        } else {
                            this.ui.arStatus.classList.remove('hidden');
                            this.ui.statusText.innerHTML =
                                '⚠️ Perangkat ini tidak mendukung AR Kamera.<br><small>Gunakan Chrome di Android.</small>';
                        }
                    } catch (_) {
                        this.ui.btnAR.classList.remove('hidden');
                    }
                } else {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.statusText.textContent = '⚠️ Browser ini tidak mendukung WebXR.';
                }
            }, 500);
        } catch (error) {
            this.ui.loadingText.textContent = 'FATAL: Gagal memuat aset 3D!';
            console.error('[App] Load Error:', error);
            alert('Terjadi kesalahan saat memuat model 3D.');
        }

        this.xrManager.onSelect = (reticleMatrix) => {
            if (!this.vrmObj || this.isPlaced) return;

            console.log('[App] Menempatkan Reina...');
            this.xrManager.placeAvatarAtReticle(
                this.vrmObj,
                reticleMatrix,
                this.xrManager.camera
            );

            this.xrManager.scene.add(this.vrmObj.scene);
            this.isPlaced = true;

            this.ui.statusText.textContent = 'Reina berhasil ditempatkan! Coba sapa dia.';
            setTimeout(() => this.ui.arStatus.classList.add('hidden'), 4000);
            this.animationManager.playIdle(true);
        };

        this.xrManager.renderer.setAnimationLoop(this.render.bind(this));
    }

    bindEvents() {
        this.ui.btnAR.addEventListener('click', async () => {
            try {
                this.apiService.unlockSpeech();
                await this.xrManager.requestSession();
                this.ui.btnAR.classList.add('hidden');
                this.ui.arStatus.classList.remove('hidden');

                if (this.ui.chatMessages.children.length === 0) {
                    this.addChatMessage(
                        'reina',
                        'Halo! Arahkan kamera ke lantai, lalu sentuh lingkaran untuk menempatkanku!'
                    );
                }
            } catch (err) {
                alert('Gagal memulai AR: ' + err.message);
            }
        });

        this.ui.btnSend.addEventListener('click', () => {
            this.apiService.unlockSpeech();
            this.handleChatSubmit();
        });

        this.ui.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.apiService.unlockSpeech();
                this.handleChatSubmit();
            }
        });

        if (this.ui.btnMic) {
            this.ui.btnMic.addEventListener('click', () => this.handleMicTap());
        }

        // 🚀 BARU: Toggle Mode Berkendara
        if (this.ui.btnRideMode) {
            this.ui.btnRideMode.addEventListener('click', () => this.toggleRideMode());
        }

        this.ui.btnSettings.addEventListener('click', () => {
            this.ui.apiKeyInput.value = this.apiService.apiKey;
            this.ui.modalSettings.classList.remove('hidden');
        });

        this.ui.btnCloseSettings.addEventListener('click', () => {
            this.ui.modalSettings.classList.add('hidden');
        });

        this.ui.btnSaveSettings.addEventListener('click', () => {
            const val = this.ui.apiKeyInput.value.trim();
            if (val) {
                this.apiService.setApiKey(val);
                this.ui.modalSettings.classList.add('hidden');
                this.addChatMessage('system', 'API Key disimpan.');
            } else {
                alert('API Key tidak boleh kosong!');
            }
        });
    }

    /**
     * 🚀 BARU: Nyalain/matiin mode hands-free buat skenario naik motor.
     * Beda dari tap-to-talk biasa — mic selalu aktif, cuma proses ucapan yang ada wake word-nya.
     */
    toggleRideMode() {
        if (!this.speechController?.isSTTSupported()) {
            this.addChatMessage('system', 'STT tidak didukung di browser ini, Mode Berkendara gak bisa dipakai.');
            return;
        }

        this.apiService.unlockSpeech();

        if (this.rideModeActive) {
            this.speechController.stopHandsFreeMode();
            this.rideModeActive = false;
            this.ui.btnRideMode?.classList.remove('active');
            this.ui.btnMic?.classList.remove('listening');
            this.addChatMessage('system', 'Mode Berkendara dimatikan. Balik ke tap-to-talk biasa.');
        } else {
            // Matiin tap-mic biasa dulu kalau lagi aktif, hindari konflik dua sesi recognition
            if (this.speechController.isListening) {
                this.speechController.stopListening();
            }
            this.speechController.startHandsFreeMode(WAKE_WORDS);
            this.rideModeActive = true;
            this.ui.btnRideMode?.classList.add('active');
            this.ui.btnMic?.classList.add('listening'); // reuse styling biar keliatan "selalu dengerin"
            this.addChatMessage('system', 'Mode Berkendara AKTIF — panggil "Reina" atau "sayang" kapan aja, tangan bebas!');
        }

        // 🚀 Sambungin ke motorEvent — pose duduk terkunci selama mode berkendara aktif
        if (this.motorEvent?.setRideMode) {
            this.motorEvent.setRideMode(this.rideModeActive);
        }
    }

    handleMicTap() {
        if (this.rideModeActive) {
            // Di mode berkendara, tap manual gak relevan (udah selalu dengerin)
            return;
        }

        if (!this.speechController?.isSTTSupported()) {
            this.addChatMessage('system', 'STT tidak didukung di browser ini.');
            return;
        }

        this.apiService.unlockSpeech();

        if (this.speechController.isListening) {
            this.speechController.stopListening();
            this.ui.btnMic.classList.remove('listening');
            return;
        }

        const started = this.speechController.startListening();
        if (started) {
            this.ui.btnMic.classList.add('listening');
            this.addChatMessage('system', 'Mendengarkan... bicara sekarang.');
        }
    }

    async handleChatSubmit() {
        const text = this.ui.chatInput.value.trim();
        if (!text) return;

        this.ui.chatInput.value = '';
        this.setChatEnabled(false);
        this.addChatMessage('user', text);

        // 🚀 Deteksi frasa naik/turun motor lewat chat ATAU suara (termasuk mode hands-free)
        if (this.motorEvent?.checkTrigger(text) && !this.rideModeActive) {
            this.toggleRideMode(); // otomatis nyalain hands-free juga, biar langsung siap dipakai
        } else if (this.motorEvent?.checkStopTrigger(text) && this.rideModeActive) {
            this.toggleRideMode();
        }

        if (!this.apiService.isConfigured()) {
            this.addChatMessage('system', 'API Key belum diisi. Buka ikon Roda Gigi.');
            this.setChatEnabled(true);
            return;
        }

        const typingId = this.addTypingIndicator();

        try {
            const rawResponse = await this.apiService.sendMessage(text);
            document.getElementById(typingId)?.remove();

            const { cleanText, primaryTag } = this.tagParser.parse(rawResponse);

            if (this.animationManager && this.isPlaced && primaryTag) {
                this.animationManager.playEmotionTag(primaryTag);
            }

            this.addChatMessage('reina', cleanText);

            if (cleanText) {
                this.apiService.speak(cleanText, this.isPlaced ? this.animationManager : null, {
                    onComplete: () => {
                        this.speechController?.resetVisemes();
                    }
                });
            }
        } catch (error) {
            document.getElementById(typingId)?.remove();
            this.addChatMessage('system', `Error LLM: ${error.message}`);
        } finally {
            this.setChatEnabled(true);
            if (!this.rideModeActive) {
                this.ui.btnMic?.classList.remove('listening');
            }
            this.ui.chatInput.focus();
        }
    }

    setChatEnabled(enabled) {
        this.ui.chatInput.disabled = !enabled;
        this.ui.btnSend.disabled = !enabled;
        // Di mode berkendara, mic harus tetap "aktif" terus — jangan didisable
        if (this.ui.btnMic && !this.rideModeActive) this.ui.btnMic.disabled = !enabled;
    }

    addChatMessage(sender, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${sender}`;
        const name = sender === 'reina' ? 'Reina' : sender === 'user' ? 'Kamu' : 'Sistem';
        div.innerHTML = `<span class="sender">${name}</span>${text}`;
        this.ui.chatMessages.appendChild(div);
        this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
    }

    addTypingIndicator() {
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'chat-bubble reina';
        div.innerHTML =
            '<span class="sender">Reina</span><div class="typing-indicator"><span></span><span></span><span></span></div>';
        this.ui.chatMessages.appendChild(div);
        this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
        return id;
    }

    /**
     * Master render loop — WebXR setAnimationLoop ONLY.
     * mixer.update(delta) + vrm.update(delta) run here every frame.
     */
    render(_timestamp, frame) {
        const delta = Math.min(this.clock.getDelta(), MAX_DELTA);

        // 🚀 FIX PERFORMA: hit-test cuma perlu jalan SEBELUM avatar ditempatkan.
        // Setelah isPlaced=true, reticle udah gak dipakai lagi — hentikan
        // frame.getHitTestResults() yang berat biar gak nge-lag terus-terusan.
        if (this.xrManager.isARActive && frame && !this.isPlaced) {
            this.xrManager.updateHitTest(frame);
        }

        if (this.animationManager) {
            this.animationManager.update(delta);
        }

        // 🚀 BARU: lip-sync berbasis volume audio real-time (TikTok TTS gak ada word-boundary)
        if (this.speechController && this.apiService?.isSpeaking()) {
            const volume = this.apiService.getVolumeLevel();
            this.speechController.setAmplitudeViseme(volume);
        }

        if (this.speechController) {
            this.speechController.update(delta);
        }

        if (this.motorEvent) {
            this.motorEvent.update(delta);
        }

        this.xrManager.renderer.render(this.xrManager.scene, this.xrManager.camera);
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('ServiceWorker registration failed:', err);
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});