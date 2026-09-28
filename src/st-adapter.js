/**
 * SillyTavern adapter.
 *
 * Everything SillyTavern-specific lives here and uses only the documented external context
 * API (`SillyTavern.getContext()`), so the checking/scoring logic above stays pure and testable.
 *
 * Chat safety: this module never calls `addOneMessage`, `saveChat`, `sendMessage` or any other
 * chat-mutating API. Test generations use `context.generateRaw`, which does not write to the
 * chat history, and never touch the user's character card.
 */

/** @returns {object|null} SillyTavern context, or null when running outside SillyTavern. */
export function getContextOrNull() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    } catch {
        return null;
    }
}

/**
 * Read the currently active character without mutating anything.
 * Uses the resolved card fields API so no card export/re-upload is required.
 */
export function readActiveCharacter(context) {
    if (!context) return { ok: false, reason: 'no-context' };
    const chid = context.characterId;
    if (chid === undefined || chid === null || chid === '') return { ok: false, reason: 'no-character' };

    const card = context.characters?.[chid];
    if (!card) return { ok: false, reason: 'no-character' };

    let resolved = {};
    try {
        resolved = context.getCharacterCardFields?.({ chid }) ?? {};
    } catch {
        resolved = {};
    }

    const fields = {
        name: card.name ?? resolved.name ?? '',
        description: resolved.description ?? card.description ?? '',
        personality: resolved.personality ?? card.personality ?? '',
        scenario: resolved.scenario ?? card.scenario ?? '',
        firstMes: resolved.firstMessage ?? card.first_mes ?? '',
        mesExamples: resolved.mesExamples ?? card.mes_example ?? '',
        systemPrompt: resolved.system ?? card.data?.system_prompt ?? '',
        postHistory: resolved.jailbreak ?? card.data?.post_history_instructions ?? '',
        characterBook: card.data?.character_book ?? null,
    };

    return { ok: true, name: fields.name, fields };
}

/**
 * Run one test's turns through SillyTavern's configured generation path.
 * The prompt is a chat-style message array, which is what the standalone tool sends.
 */
export async function generateForTest(context, { systemPrompt, test, responseLength, isCancelled }) {
    const messages = [{ role: 'system', content: systemPrompt }];
    const responses = [];
    for (const turn of test.turns) {
        if (isCancelled?.()) throw new Error('cancelled');
        messages.push({ role: 'user', content: turn });
        const raw = await context.generateRaw({
            prompt: messages,
            systemPrompt,
            responseLength,
            trimNames: true,
        });
        const answer = typeof raw === 'string' ? raw.trim() : '';
        responses.push(answer);
        messages.push({ role: 'assistant', content: answer });
    }
    return responses;
}

/** Chat length snapshot, used to prove test runs do not touch real chat history. */
export function chatLength(context) {
    return Array.isArray(context?.chat) ? context.chat.length : null;
}
