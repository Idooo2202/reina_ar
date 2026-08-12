import * as THREE from 'three';
import { VRMExpressionPresetName } from '@pixiv/three-vrm';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Animation Manager
 * VRMA-bound clips, TTS sync (talking ↔ idle), emotion tags
 * with LoopOnce revert, facial expression presets.
 * ═══════════════════════════════════════════════════════════
 */

const ONE_SHOT_TAGS = new Set([
    'welcome',
    'angry',
    'sad',
    'kiss',
    'yawn',
    'bashful',
    'hand_raising'
]);

const CONTINUOUS_TAGS = new Set(['idle', 'talking', 'sit']);

export class AnimationManager {
    constructor(vrm, clips) {
        this.vrm = vrm;
        this.clips = clips;

        this.mixer = new THREE.AnimationMixer(this.vrm.scene);
        this.crossFadeDuration = 0.5;

        this.currentAction = null;
        this.currentState = '';
        this.actions = new Map();

        this.isSpeaking = false;
        this.isOneShotActive = false;
        this.overrideContinuous = false;

        this.mixer.addEventListener('finished', this.onActionFinished.bind(this));

        console.log('[AnimationManager] Klip tersedia:', Array.from(this.clips.keys()));
    }

    getAction(stateName) {
        if (this.actions.has(stateName)) {
            return this.actions.get(stateName);
        }
        const clip = this.clips.get(stateName);
        if (!clip) return null;
        const action = this.mixer.clipAction(clip);
        this.actions.set(stateName, action);
        return action;
    }

    playState(stateName, loop = true, force = false) {
        if (!force && this.currentState === stateName) return;

        const action = this.getAction(stateName);
        if (!action) {
            console.error(`[AnimationManager] Klip '${stateName}' tidak ditemukan. Fallback idle.`);
            if (stateName !== 'idle') this.playState('idle', true, true);
            return;
        }

        console.log(`[AnimationManager] → ${stateName} (loop: ${loop})`);

        action.reset();
        if (loop) {
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            this.isOneShotActive = false;
        } else {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            this.isOneShotActive = true;
        }

        if (this.currentAction && this.currentAction !== action) {
            action.crossFadeFrom(this.currentAction, this.crossFadeDuration, true);
        }

        action.play();
        this.currentAction = action;
        this.currentState = stateName;
        this.applyExpression(stateName);
    }

    playIdle(force = false) {
        this.overrideContinuous = false;
        this.playState('idle', true, force);
    }

    playTalking(force = false) {
        this.playState('talking', true, force);
    }

    playGesture(gestureName) {
        if (CONTINUOUS_TAGS.has(gestureName)) {
            this.overrideContinuous = true;
            this.playState(gestureName, true, true);
            return;
        }
        this.playState(gestureName, false, true);
    }

    /**
     * Plays the primary emotion tag from LLM response immediately.
     */
    playEmotionTag(tag) {
        if (!tag) return;

        if (tag === 'talking') {
            if (this.isSpeaking) this.playTalking(true);
            return;
        }

        if (tag === 'idle') {
            if (!this.isSpeaking) this.playIdle(true);
            return;
        }

        if (CONTINUOUS_TAGS.has(tag)) {
            this.playGesture(tag);
            return;
        }

        if (ONE_SHOT_TAGS.has(tag)) {
            this.playState(tag, false, true);
        }
    }

    /**
     * TTS onstart → crossfade to talking.vrma (unless one-shot gesture is playing).
     */
    onTTSStart() {
        this.isSpeaking = true;
        if (!this.isOneShotActive && !this.overrideContinuous) {
            this.playTalking(true);
        }
    }

    /**
     * TTS onend → revert to idle.vrma (unless one-shot or sit override active).
     */
    onTTSEnd() {
        this.isSpeaking = false;
        if (this.isOneShotActive) return;

        if (this.overrideContinuous && this.currentState === 'sit') return;

        this.playIdle(true);
    }

    /**
     * LoopOnce gesture finished → return to talking if TTS active, else idle.
     */
    onActionFinished(event) {
        if (event.action !== this.currentAction) return;

        const finishedName = event.action.getClip().name;
        console.log(`[AnimationManager] Gesture selesai: ${finishedName}`);

        if (!ONE_SHOT_TAGS.has(finishedName)) return;

        this.isOneShotActive = false;

        if (this.isSpeaking) {
            this.playTalking(true);
        } else if (this.overrideContinuous && this.currentState === 'sit') {
            return;
        } else {
            this.playIdle(true);
        }
    }

    applyExpression(stateName) {
        const em = this.vrm.expressionManager;
        if (!em) return;

        em.setValue(VRMExpressionPresetName.Happy, 0);
        em.setValue(VRMExpressionPresetName.Angry, 0);
        em.setValue(VRMExpressionPresetName.Sad, 0);
        em.setValue(VRMExpressionPresetName.Relaxed, 0);
        em.setValue(VRMExpressionPresetName.Surprised, 0);

        switch (stateName) {
            case 'welcome':
            case 'kiss':
                em.setValue(VRMExpressionPresetName.Happy, 1.0);
                break;
            case 'angry':
                em.setValue(VRMExpressionPresetName.Angry, 1.0);
                break;
            case 'sad':
                em.setValue(VRMExpressionPresetName.Sad, 1.0);
                break;
            case 'bashful':
                em.setValue(VRMExpressionPresetName.Relaxed, 1.0);
                break;
            case 'hand_raising':
            case 'talking':
                em.setValue(VRMExpressionPresetName.Happy, 0.4);
                break;
            case 'yawn':
                em.setValue(VRMExpressionPresetName.Relaxed, 0.8);
                break;
        }
    }

    update(delta) {
        if (this.mixer) this.mixer.update(delta);
        if (this.vrm) this.vrm.update(delta);
    }
}
