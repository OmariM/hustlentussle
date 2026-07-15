/**
 * The cross-file window surface shared by the classic scripts.
 *
 * Only symbols consumed across file boundaries belong here — app.js's ~90
 * internal globals stay out on purpose; they become module-scoped as files
 * are converted.
 *
 * All members are optional because script load order (and the lazy debug
 * bootstrap in index.html) means any of them can be absent at call time.
 */

import type { BattleExportV1, GameStateResponse } from './types';

declare global {
    interface Window {
        // router.ts
        navigate?: (path: string, opts?: { replace?: boolean }) => void;
        renderRoute?: () => void;

        // app.js (top-level function declarations become window properties)
        showScreen?: (el: HTMLElement) => void;
        hydrateBattleRoute?: (sessionId: string) => void;
        hydratePrelimRoute?: (sessionId: string) => void;
        initPrelimSetup?: () => void;
        hydrateResultsRoute?: (sessionId: string | null) => void;
        updateSessionIdDisplay?: () => void;
        renderFromState?: (state: GameStateResponse) => void;
        refreshCanonicalState?: () => Promise<void>;
        endGame?: () => void;

        // Shared vote/roster state mirrored onto window (DebugTools keeps its
        // own copies here; app.js's internal `let` state is separate)
        guestJudges?: string[];
        initialLeads?: string[];
        initialFollows?: string[];
        leadVotes?: Record<string, number>;
        followVotes?: Record<string, number>;
        votingLocked?: { lead: boolean; follow: boolean };
        openBattlePayloadEditor?: (
            payload: BattleExportV1,
            opts: {
                title?: string;
                showMetaFields?: boolean;
                initialMeta?: { name?: string; battle_date?: string | null };
                onSave: (
                    editedPayload: BattleExportV1,
                    // null when showMetaFields is false (the results-screen flow)
                    meta: { name: string; battle_date: string } | null,
                ) => Promise<void>;
            },
        ) => void;
        exportBattleResultsImage?: (
            payload: BattleExportV1,
            meta: { name: string; battle_date: string },
        ) => Promise<void>;
        sessionId?: string | null;

        // ytd.ts
        ytdOnEnterStats?: () => void;

        // components/DebugTools.ts + the inline bootstrap in index.html
        ENABLE_DEBUG_TOOLS?: boolean;
        DebugTools?: new () => unknown;
        debugTools?: { autoAdvance?: boolean };
    }
}

export {};
