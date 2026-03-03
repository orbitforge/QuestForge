/* ═══════════════════════════════════════════════
   Quest Schema, Constants & Factory Functions
   ═══════════════════════════════════════════════ */

export const STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    OVERDUE: 'overdue',
    DORMANT: 'dormant',
    RETIRED: 'retired'
};

export const DIFFICULTY_MULTIPLIER = {
    1: 1.0,
    2: 1.3,
    3: 1.6
};

export const DIFFICULTY_LABEL = {
    1: 'Easy',
    2: 'Medium',
    3: 'Hard'
};

export const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'];

export const DORMANCY_THRESHOLD_DAYS = 7;
export const DEFAULT_OVERDUE_THRESHOLD_DAYS = 3;
export const MOMENTUM_DURATION_MS = 60 * 60 * 1000; // 60 minutes
export const MOMENTUM_BONUS_INCREMENT = 0.10;
export const MOMENTUM_BONUS_MAX = 0.20;

/**
 * Generate a unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new quest object with defaults
 */
export function createQuest(overrides = {}) {
    return {
        id: generateId(),
        title: '',
        description: '',
        category: '',
        tags: [],
        difficulty: 1,
        xpBase: 50,
        xpPerObjective: 10,
        objectives: [],
        status: STATUS.ACTIVE,
        dueDate: null,
        overdueThresholdDays: null,
        recurringRule: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        lastProgressAt: new Date().toISOString(),
        ...overrides
    };
}

/**
 * Create a new objective
 */
export function createObjective(text = '') {
    return {
        id: generateId(),
        text,
        completed: false
    };
}

/**
 * Create a legend log entry
 */
export function createLegendEntry(quest, xpEarned, momentumBonusApplied) {
    return {
        id: generateId(),
        questId: quest.id,
        title: quest.title,
        category: quest.category,
        difficulty: quest.difficulty,
        xpEarned,
        completedAt: new Date().toISOString(),
        momentumBonusApplied
    };
}
