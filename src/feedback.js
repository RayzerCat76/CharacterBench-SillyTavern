/**
 * Privacy-safe feedback packet.
 *
 * Ported from CharacterBench v0.2.1-alpha `feedback_packet.py` (`safe_categories`,
 * `weak_tests`, single-run `build_packet`). The packet never contains prompts, responses,
 * transcripts, chat history, character names, endpoint URLs, local paths or credentials.
 * Pure logic: no SillyTavern and no DOM dependencies.
 */

export const FEEDBACK_URL = 'https://github.com/RayzerCat76/CharacterBenchmark/issues/1';
export const CHARACTERBENCH_VERSION = '0.2.1-alpha';

export const SAFE_CATEGORIES = new Set([
    'Identity', 'Personality', 'Knowledge', 'Relationships', 'Style', 'Language',
    'Robustness', 'Memory', 'Long conversation', 'Values',
]);

/** Keep only whitelisted categories; fold anything else into a single "Other" bucket. */
export function safeCategories(scores) {
    if (!scores || typeof scores !== 'object') return {};
    const kept = {};
    const others = [];
    for (const [key, value] of Object.entries(scores)) {
        if (typeof value !== 'number' || Number.isNaN(value)) continue;
        if (SAFE_CATEGORIES.has(key)) kept[key] = Number(value);
        else others.push(Number(value));
    }
    if (others.length) kept.Other = Math.round((others.reduce((a, b) => a + b, 0) / others.length) * 10) / 10;
    return kept;
}

/** Tests scoring below 8/10, reported without their ids, descriptions or response text. */
export function weakTests(tests) {
    if (!Array.isArray(tests)) return [];
    const weak = [];
    for (const item of tests) {
        if (!item || typeof item !== 'object') continue;
        const score = item.score;
        if (typeof score !== 'number' || score >= 8) continue;
        const category = SAFE_CATEGORIES.has(item.category) ? item.category : 'Other';
        weak.push({ test: `weak_${weak.length + 1}`, category, score });
    }
    return weak;
}

function providerFamily(value) {
    if (typeof value !== 'string' || !value) return null;
    const lower = value.toLowerCase();
    if (lower.includes('ollama')) return 'ollama';
    if (lower.includes('openai')) return 'openai-compatible';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
    if (lower.includes('kobold')) return 'kobold';
    return 'other';
}

export function buildFeedbackPacket(summary) {
    const tests = summary?.tests || [];
    const packet = {
        characterbench_version: CHARACTERBENCH_VERSION,
        privacy: 'No prompts, responses, transcripts, names, labels, endpoint URLs, or local paths included.',
        result_type: 'single',
        status: 'ok',
        overall: typeof summary?.overall === 'number' ? summary.overall : null,
        categories: safeCategories(summary?.categories),
        weak_tests: weakTests(tests),
        provider: providerFamily(summary?.provider),
        feedback_url: FEEDBACK_URL,
    };
    return packet;
}

/** Human-readable markdown rendering of the packet, safe to paste into the feedback issue. */
export function renderFeedbackMarkdown(packet) {
    const lines = [
        '# CharacterBench extension feedback packet',
        '',
        `- Version: \`${packet.characterbench_version}\``,
        `- Result type: \`${packet.result_type}\``,
        '- Private prompts, responses, names, labels, URLs and local paths are intentionally excluded.',
        '',
        `- Overall: **${packet.overall}/10**`,
        `- Provider family: \`${packet.provider ?? 'unknown'}\``,
        '',
    ];
    const categories = Object.entries(packet.categories || {});
    if (categories.length) {
        lines.push('| Category | Score |', '| --- | --- |');
        for (const [category, score] of categories) lines.push(`| ${category} | ${score}/10 |`);
        lines.push('');
    }
    if (packet.weak_tests?.length) {
        lines.push('Weakest checks (scores below 8/10):', '');
        for (const item of packet.weak_tests) lines.push(`- \`${item.test}\` — ${item.category}: ${item.score}/10`);
        lines.push('');
    }
    lines.push(`Report or discuss: ${packet.feedback_url}`, '');
    return lines.join('\n');
}
