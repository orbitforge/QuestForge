/* ═══════════════════════════════════════════════
   Quest Schema, Constants & Factory Functions (V2)
   ═══════════════════════════════════════════════ */

export const STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    OVERDUE: 'overdue',
    DORMANT: 'dormant',
    RETIRED: 'retired',
    SNOOZED: 'snoozed'
};

export const URGENCY = {
    LOW: 'low',
    MODERATE: 'moderate',
    CRITICAL: 'critical'
};

export const SNOOZE_TYPE = {
    SOFT: 'soft',
    HARD: 'hard'
};

// ── Difficulty Tiers (V2 — nonlinear scaling) ───
export const DIFFICULTY_MULTIPLIER = {
    1: 0.8,
    2: 1.0,
    3: 1.3,
    4: 1.7,
    5: 2.2,
    6: 2.8,
    7: 3.5
};

export const DIFFICULTY_LABEL = {
    1: 'Trivial',
    2: 'Easy',
    3: 'Medium',
    4: 'Hard',
    5: 'Expert',
    6: 'Master',
    7: 'Legendary'
};

export const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'];

// ── Constants ───────────────────────────────────
export const DORMANCY_THRESHOLD_DAYS = 7;
export const DEFAULT_OVERDUE_THRESHOLD_DAYS = 3;
export const DEFAULT_ESCALATION_DAYS = 3;
export const OVERDUE_REDEMPTION_BONUS = 0.15;
export const MOMENTUM_DURATION_MS = 60 * 60 * 1000;
export const MOMENTUM_BONUS_INCREMENT = 0.10;
export const MOMENTUM_BONUS_MAX = 0.20;
export const SESSION_CLUSTER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ── Event Types ─────────────────────────────────
export const EVENT = {
    QUEST_CREATED: 'QUEST_CREATED',
    QUEST_UPDATED: 'QUEST_UPDATED',
    QUEST_COMPLETED: 'QUEST_COMPLETED',
    QUEST_OVERDUE: 'QUEST_OVERDUE',
    QUEST_DORMANT: 'QUEST_DORMANT',
    QUEST_RETIRED: 'QUEST_RETIRED',
    QUEST_SNOOZED: 'QUEST_SNOOZED',
    QUEST_UNSNOOZED: 'QUEST_UNSNOOZED',
    QUEST_REACTIVATED: 'QUEST_REACTIVATED',
    QUEST_DELETED: 'QUEST_DELETED',
    OBJECTIVE_TOGGLED: 'OBJECTIVE_TOGGLED',
    RECURRENCE_SPAWNED: 'RECURRENCE_SPAWNED',
    XP_AWARDED: 'XP_AWARDED',
    MOMENTUM_APPLIED: 'MOMENTUM_APPLIED',
    STATE_IMPORTED: 'STATE_IMPORTED'
};

// ── Executive Quest Templates ───────────────────
export const QUEST_TEMPLATES = {
    strategic_extraction: {
        title: 'Strategic Extraction',
        description: 'A high-stakes strategic extraction operation requiring careful planning and execution.',
        category: 'Strategy',
        difficulty: 5,
        xpBase: 200,
        xpPerObjective: 40,
        objectives: [
            'Define scope',
            'Identify stakeholders',
            'Draft extraction plan',
            'Execute extraction',
            'Post-mortem review'
        ]
    },
    risk_mitigation: {
        title: 'Risk Mitigation',
        description: 'Identify, assess, and mitigate key operational risks.',
        category: 'Operations',
        difficulty: 4,
        xpBase: 150,
        xpPerObjective: 30,
        objectives: [
            'Identify risks',
            'Assess impact/probability',
            'Define mitigations',
            'Implement controls',
            'Validate effectiveness'
        ]
    },
    capacity_planning: {
        title: 'Capacity Planning',
        description: 'Audit current infrastructure capacity and plan for future demand.',
        category: 'Infrastructure',
        difficulty: 4,
        xpBase: 150,
        xpPerObjective: 30,
        objectives: [
            'Audit current capacity',
            'Forecast demand',
            'Identify gaps',
            'Propose scaling plan',
            'Get approval'
        ]
    },
    infrastructure_upgrade: {
        title: 'Infrastructure Upgrade',
        description: 'Plan and execute a critical infrastructure upgrade with zero downtime.',
        category: 'Infrastructure',
        difficulty: 6,
        xpBase: 250,
        xpPerObjective: 50,
        objectives: [
            'Assess current state',
            'Design target architecture',
            'Plan migration',
            'Execute upgrade',
            'Validate & monitor'
        ]
    },
    policy_drafting: {
        title: 'Policy Drafting',
        description: 'Research, draft, and publish a new organizational policy.',
        category: 'Governance',
        difficulty: 3,
        xpBase: 100,
        xpPerObjective: 20,
        objectives: [
            'Research requirements',
            'Draft policy',
            'Internal review',
            'Incorporate feedback',
            'Publish & communicate'
        ]
    }
};

/**
 * Generate a unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new quest object with V2 defaults
 */
export function createQuest(overrides = {}) {
    return {
        id: generateId(),
        title: '',
        description: '',
        category: '',
        tags: [],
        difficulty: 2,
        xpBase: 50,
        xpPerObjective: 10,
        objectives: [],
        status: STATUS.ACTIVE,
        dueDate: null,
        overdueThresholdDays: null,
        overdueEscalationDays: null,
        urgencyLevel: URGENCY.LOW,
        snoozedUntil: null,
        snoozeType: null,
        recurringRule: null,
        template: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        lastProgressAt: new Date().toISOString(),
        _recurrenceProcessed: false,
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

/**
 * Create a change event
 */
export function createEvent(type, questId, payload = {}) {
    return {
        id: generateId(),
        type,
        questId: questId || null,
        timestamp: new Date().toISOString(),
        payload,
        exported: false
    };
}
