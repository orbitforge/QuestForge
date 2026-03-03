/* ═══════════════════════════════════════════════
   Momentum Engine
   60-min window, +10% per chain, +20% max
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { MOMENTUM_DURATION_MS, MOMENTUM_BONUS_INCREMENT, MOMENTUM_BONUS_MAX } from '../schema.js';

const MOMENTUM_KEY = 'momentum';

/**
 * Get current momentum state from DB
 */
export async function getMomentumState() {
    const record = await db.appState.get(MOMENTUM_KEY);
    if (!record) {
        return { active: false, remainingMs: 0, currentBonus: 0 };
    }

    const elapsed = Date.now() - record.startedAt;
    const remainingMs = MOMENTUM_DURATION_MS - elapsed;

    if (remainingMs <= 0) {
        // Expired — clean up
        await db.appState.delete(MOMENTUM_KEY);
        return { active: false, remainingMs: 0, currentBonus: 0 };
    }

    return {
        active: true,
        remainingMs,
        currentBonus: record.currentBonus,
        startedAt: record.startedAt
    };
}

/**
 * Start or extend momentum on qualifying quest completion
 * Returns the bonus that should be applied to this completion
 */
export async function applyMomentum() {
    const state = await getMomentumState();
    let bonusForThis = 0;
    let newBonus = 0;

    if (state.active) {
        // Chain continues — award current bonus, increment for next
        // Guard: clamp bonus to never exceed max cap
        bonusForThis = Math.min(state.currentBonus, MOMENTUM_BONUS_MAX);
        newBonus = Math.min(state.currentBonus + MOMENTUM_BONUS_INCREMENT, MOMENTUM_BONUS_MAX);
    } else {
        // First qualifying completion — no bonus yet, start window
        bonusForThis = 0;
        newBonus = MOMENTUM_BONUS_INCREMENT;
    }

    // Guard: clamp newBonus to prevent any possibility of infinite stacking
    newBonus = Math.min(newBonus, MOMENTUM_BONUS_MAX);

    // Reset / start timer
    await db.appState.put({
        key: MOMENTUM_KEY,
        startedAt: Date.now(),
        currentBonus: newBonus
    });

    // Final guard: ensure returned bonus is capped
    return Math.min(bonusForThis, MOMENTUM_BONUS_MAX);
}

/**
 * Format remaining ms to HH:MM
 */
export function formatMomentumTimer(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
