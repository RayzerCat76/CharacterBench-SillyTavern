/**
 * Baseline persistence and run comparison.
 *
 * Baselines deliberately store **score metadata only** (no prompts, no responses, no
 * transcripts), matching the standalone CharacterBench rule that "saved baselines keep score
 * metadata and test fingerprints only". Pure logic: no SillyTavern and no DOM dependencies.
 */

export const DEFAULT_DELTA_THRESHOLD = 0.05;

/** Small, dependency-free FNV-1a hash so a character gets a stable local key. */
export function fnv1a(value) {
    let hash = 0x811c9dc5;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * Stable identity used to key baselines.
 *
 * Deliberately derived from the character name ONLY. The whole point of a baseline is to
 * survive the change you are testing: editing the description, system prompt, lorebook,
 * prompt template or swapping the model must NOT orphan the baseline. Including card content
 * or the check list here would break the save-baseline -> change -> rerun -> compare loop.
 * (`tests` is accepted for call-site compatibility and intentionally unused.)
 */
export function characterKey(character, tests = []) { // eslint-disable-line no-unused-vars
    const name = String(character?.name ?? 'character').trim() || 'character';
    return `${name.slice(0, 40)}::${fnv1a(name.toLowerCase())}`;
}

/** Convert a run summary into a baseline record (score metadata only). */
export function createBaseline(summary, savedAt = new Date().toISOString()) {
    return {
        saved_at: savedAt,
        overall: summary.overall,
        categories: { ...summary.categories },
        tests: (summary.tests || []).map(test => ({
            test_id: test.test_id,
            category: test.category,
            score: test.score,
        })),
    };
}

/**
 * Compare a fresh run against a stored baseline.
 * delta > +threshold => improvement, delta < -threshold => regression, otherwise unchanged.
 */
export function compareRuns(baseline, summary, threshold = DEFAULT_DELTA_THRESHOLD) {
    const before = new Map((baseline?.tests || []).map(test => [test.test_id, test]));
    const after = new Map((summary?.tests || []).map(test => [test.test_id, test]));

    const regressions = [];
    const improvements = [];
    const unchanged = [];
    const added = [];
    const removed = [];

    for (const [testId, test] of after) {
        const previous = before.get(testId);
        if (!previous) {
            added.push({ test_id: testId, category: test.category, score: test.score });
            continue;
        }
        const delta = Math.round((test.score - previous.score) * 10) / 10;
        const entry = {
            test_id: testId,
            category: test.category,
            before: previous.score,
            after: test.score,
            delta,
        };
        if (delta > threshold) improvements.push(entry);
        else if (delta < -threshold) regressions.push(entry);
        else unchanged.push(entry);
    }

    for (const [testId, test] of before) {
        if (!after.has(testId)) removed.push({ test_id: testId, category: test.category, score: test.score });
    }

    const overallDelta = baseline && typeof baseline.overall === 'number'
        ? Math.round((summary.overall - baseline.overall) * 10) / 10
        : null;

    const bySeverity = (a, b) => a.delta - b.delta;

    return {
        threshold,
        overall_before: baseline?.overall ?? null,
        overall_after: summary?.overall ?? null,
        overall_delta: overallDelta,
        regressions: regressions.sort(bySeverity),
        improvements: improvements.sort((a, b) => b.delta - a.delta),
        unchanged,
        added,
        removed,
    };
}
