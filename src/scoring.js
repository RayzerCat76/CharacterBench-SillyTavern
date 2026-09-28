/**
 * Deterministic evaluation semantics.
 *
 * Ported 1:1 from CharacterBench v0.2.1-alpha `run_eval.py`:
 * `contains_cjk`, `normalize_for_match`, `term_present`, `response_criteria`,
 * `conversation_criteria`, `score_criteria`, `score_test`, `category_scores`,
 * `build_summary`. Pure logic: no SillyTavern and no DOM dependencies.
 *
 * Scoring is penalty-based, not averaged over checks: score = max(0, 10 - failures * 10/3),
 * rounded to one decimal. Adding a passing check can never raise a failing response's score.
 */

export const SCORE_MAX = 10;
const PENALTY_PER_FAILURE = 10 / 3;

export function containsCjk(value) {
    return /[\u3400-\u9fff]/.test(String(value ?? ''));
}

export function normalizeForMatch(value) {
    return String(value ?? '')
        .replaceAll('’', "'")
        .replaceAll('‘', "'")
        .replaceAll('“', '"')
        .replaceAll('”', '"')
        .replaceAll('—', '-')
        .replaceAll('–', '-');
}

export function termPresent(value, term) {
    const text = normalizeForMatch(value);
    const needle = normalizeForMatch(term);
    if (/^[A-Za-z0-9_-]+$/.test(needle)) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'i').test(text);
    }
    return text.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Python-style repr for the term lists embedded in failure reasons, so the extension's
 * explanations are byte-identical to the standalone tool's (`['AI', "don't know"]`).
 */
export function pyRepr(value) {
    if (Array.isArray(value)) return '[' + value.map(pyRepr).join(', ') + ']';
    if (typeof value === 'string') {
        const useDouble = value.includes("'") && !value.includes('"');
        const quote = useDouble ? '"' : "'";
        let body = value.replaceAll('\\', '\\\\');
        body = useDouble ? body.replaceAll('"', '\\"') : body.replaceAll("'", "\\'");
        return quote + body + quote;
    }
    if (value === null) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    return String(value);
}

function round1(value) {
    // Match Python's round(x, 1) on the binary value.
    // Multiplying by ten first diverges from Python (8.35 * 10 === 83.50000000000001, which would
    // round up to 8.4 while Python gives 8.3 for the same double). `toFixed` is specified to pick
    // the decimal closest to the actual binary value, which reproduces Python for every value this
    // module produces; `tests/scoring.test.mjs` asserts equality against the Python reference.
    return Number(value.toFixed(1));
}

export function responseCriteria(response, checks = {}) {
    const criteria = [];
    const value = String(response ?? '');

    const requiredAny = checks.must_contain_any || [];
    if (requiredAny.length) {
        const passed = requiredAny.some(term => termPresent(value, term));
        criteria.push([passed, passed
            ? 'contains at least one expected signal'
            : `missing expected signal: one of ${pyRepr(requiredAny)}`]);
    }

    const requiredAll = checks.must_contain_all || [];
    if (requiredAll.length) {
        const missing = requiredAll.filter(term => !termPresent(value, term));
        criteria.push([!missing.length, !missing.length
            ? 'contains all required signals'
            : `missing required text: ${pyRepr(missing)}`]);
    }

    const requiredGroups = checks.must_contain_groups || [];
    if (requiredGroups.length) {
        const missingGroups = requiredGroups.filter(group => !group.some(term => termPresent(value, term)));
        criteria.push([!missingGroups.length, !missingGroups.length
            ? 'contains a signal from every required group'
            : `missing required signal groups: ${pyRepr(missingGroups)}`]);
    }

    const forbidden = checks.must_not_contain || [];
    if (forbidden.length) {
        const hits = forbidden.filter(term => termPresent(value, term));
        criteria.push([!hits.length, !hits.length
            ? 'avoids forbidden claims/style'
            : `contains forbidden text: ${pyRepr(hits)}`]);
    }

    const maxChars = checks.max_chars;
    if (maxChars) {
        const passed = value.length <= maxChars;
        criteria.push([passed, passed ? `length <= ${maxChars}` : `too long: ${value.length} chars > ${maxChars}`]);
    }

    if (checks.require_cjk) {
        const passed = containsCjk(value);
        criteria.push([passed, passed ? 'contains Chinese text' : 'expected Chinese text']);
    }

    if (checks.forbid_cjk) {
        const passed = !containsCjk(value);
        criteria.push([passed, passed ? 'stays in English' : 'unexpected Chinese text in English response']);
    }

    return criteria;
}

export function conversationCriteria(responses = [], checks = {}) {
    const criteria = [];
    if (!checks || !Object.keys(checks).length) return criteria;
    const joined = responses.join('\n');

    const requiredAny = checks.must_contain_any || [];
    if (requiredAny.length) {
        const passed = requiredAny.some(term => termPresent(joined, term));
        criteria.push([passed, passed
            ? 'conversation contains an expected signal'
            : `conversation missing expected signal: one of ${pyRepr(requiredAny)}`]);
    }

    const requiredGroups = checks.must_contain_groups || [];
    if (requiredGroups.length) {
        const missingGroups = requiredGroups.filter(group => !group.some(term => termPresent(joined, term)));
        criteria.push([!missingGroups.length, !missingGroups.length
            ? 'conversation contains a signal from every required group'
            : `conversation missing required signal groups: ${pyRepr(missingGroups)}`]);
    }

    const forbidden = checks.must_not_contain || [];
    if (forbidden.length) {
        const hits = forbidden.filter(term => termPresent(joined, term));
        criteria.push([!hits.length, !hits.length
            ? 'conversation avoids forbidden claims/style'
            : `conversation contains forbidden text: ${pyRepr(hits)}`]);
    }

    const maxIdentical = checks.max_identical_responses;
    if (maxIdentical !== undefined && maxIdentical !== null && responses.length) {
        const normalized = responses.map(response => String(response).toLowerCase().trim().split(/\s+/).join(' '));
        const counts = new Map();
        for (const item of normalized) counts.set(item, (counts.get(item) || 0) + 1);
        const highest = Math.max(...counts.values());
        const passed = highest <= Number(maxIdentical);
        criteria.push([passed, passed
            ? `no response repeated more than ${maxIdentical} times`
            : `same response repeated ${highest} times`]);
    }

    return criteria;
}

export function scoreCriteria(criteria) {
    if (!criteria.length) return { score: 10, reasons: ['no checks configured'] };
    const failureCount = criteria.filter(([ok]) => !ok).length;
    const score = round1(Math.max(0, SCORE_MAX - failureCount * PENALTY_PER_FAILURE));
    const reasons = criteria.map(([ok, reason]) => (ok ? 'PASS: ' : 'FAIL: ') + reason);
    return { score, reasons };
}

export function scoreTest(responses, finalChecks = {}, conversationChecks = {}) {
    const criteria = responseCriteria(responses[responses.length - 1] ?? '', finalChecks);
    criteria.push(...conversationCriteria(responses, conversationChecks));
    return scoreCriteria(criteria);
}

export function categoryScores(results) {
    const grouped = new Map();
    for (const result of results) {
        if (!grouped.has(result.category)) grouped.set(result.category, []);
        grouped.get(result.category).push(result.score);
    }
    const out = {};
    for (const [category, scores] of grouped) {
        out[category] = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return out;
}

export function buildSummary({ character, results, providerLabel }) {
    const overall = round1(results.reduce((sum, r) => sum + r.score, 0) / Math.max(results.length, 1));
    return {
        character: character.name,
        provider: providerLabel,
        generated_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        overall,
        categories: categoryScores(results),
        tests: results,
    };
}

/** System prompt used for generation, mirroring `build_system_prompt` in the standalone tool. */
export function buildSystemPrompt(character) {
    const sections = [
        character.system_prompt || '',
        'Identity:\n- ' + (character.identity || []).join('\n- '),
        'Personality:\n- ' + (character.personality || []).join('\n- '),
        'Knowledge boundaries:\n- ' + (character.knowledge_boundaries || []).join('\n- '),
        'English style:\n- ' + (character.style_en || []).join('\n- '),
        'Chinese style:\n- ' + (character.style_zh || []).join('\n- '),
    ];
    const relationships = character.relationships || {};
    const names = Object.keys(relationships);
    if (names.length) {
        sections.push('Relationships:\n' + names.map(name => `- ${name}: ${relationships[name]}`).join('\n'));
    }
    return sections.filter(section => section.trim()).join('\n\n');
}
