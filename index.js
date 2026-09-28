/**
 * CharacterBench for SillyTavern — extension entry point.
 *
 * Runs CharacterBench's diagnostic regression loop against the currently selected character
 * using SillyTavern's own configured generation path. Standalone companion: CharacterBench
 * v0.2.1-alpha (https://github.com/RayzerCat76/CharacterBenchmark).
 *
 * Diagnostic regression checks — not a general model-quality score. Scores are diagnostic
 * signals, not scientifically validated rankings.
 *
 * Safety properties (see README):
 *  - no telemetry, no analytics, no network calls of our own;
 *  - test generations use `generateRaw` and never enter or mutate chat history;
 *  - the character card and chat are never modified;
 *  - no provider credentials are read or stored.
 */

import { buildCharacterFromFields, starterTests } from './src/checks.js';
import { buildSummary, buildSystemPrompt, scoreTest } from './src/scoring.js';
import { characterKey, compareRuns, createBaseline } from './src/baseline.js';
import { buildFeedbackPacket, renderFeedbackMarkdown } from './src/feedback.js';
import { chatLength, generateForTest, getContextOrNull, readActiveCharacter } from './src/st-adapter.js';

const MODULE_NAME = 'characterbench-st';
const EXTENSION_VERSION = '0.1.0-alpha';

const DEFAULT_SETTINGS = {
    options: {
        responseLength: 120,
        baselineLimit: 20,
    },
    disabledChecks: [],
    baselines: {},
};

const state = {
    character: null,
    tests: [],
    signals: null,
    lastRun: null,
    lastComparison: null,
    running: false,
    cancelled: false,
    status: '',
    error: '',
};

let initialized = false;

function settings(context) {
    const store = context.extensionSettings;
    if (!store[MODULE_NAME]) store[MODULE_NAME] = structuredCloneSafe(DEFAULT_SETTINGS);
    const current = store[MODULE_NAME];
    current.options = { ...DEFAULT_SETTINGS.options, ...(current.options || {}) };
    current.disabledChecks = Array.isArray(current.disabledChecks) ? current.disabledChecks : [];
    current.baselines = current.baselines && typeof current.baselines === 'object' ? current.baselines : {};
    return current;
}

function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function setStatus(message, isError = false) {
    state.status = isError ? '' : message;
    state.error = isError ? message : '';
    render();
}

/* ------------------------------------------------------------------ UI */

function buildPanel() {
    if (document.getElementById(`${MODULE_NAME}-drawer`)) return;

    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container) {
        console.warn('[CharacterBench] extension settings container not found; panel not mounted');
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = `${MODULE_NAME}-drawer`;
    wrapper.className = 'inline-drawer';
    wrapper.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>CharacterBench</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="cb-note">Diagnostic regression checks — not a general model-quality score.</div>
            <div id="${MODULE_NAME}-status" class="cb-status"></div>
            <div id="${MODULE_NAME}-character" class="cb-character"></div>
            <div class="cb-row">
                <input id="${MODULE_NAME}-refresh" class="menu_button" type="button" value="Load checks for current character">
            </div>
            <div id="${MODULE_NAME}-checks" class="cb-checks"></div>
            <div class="cb-row">
                <label class="cb-inline">Max response length
                    <input id="${MODULE_NAME}-length" class="text_pole cb-length" type="number" min="16" max="2048" step="8">
                </label>
                <input id="${MODULE_NAME}-run" class="menu_button" type="button" value="Run selected checks">
                <input id="${MODULE_NAME}-stop" class="menu_button" type="button" value="Stop" disabled>
            </div>
            <div id="${MODULE_NAME}-progress" class="cb-progress"></div>
            <div id="${MODULE_NAME}-results" class="cb-results"></div>
            <div class="cb-row">
                <input id="${MODULE_NAME}-save" class="menu_button" type="button" value="Save as baseline" disabled>
                <input id="${MODULE_NAME}-compare" class="menu_button" type="button" value="Compare with baseline" disabled>
            </div>
            <div id="${MODULE_NAME}-baseline" class="cb-baseline"></div>
            <div class="cb-row">
                <input id="${MODULE_NAME}-export" class="menu_button" type="button" value="Export feedback packet" disabled>
            </div>
            <textarea id="${MODULE_NAME}-packet" class="text_pole cb-packet" readonly placeholder="Privacy-safe feedback packet appears here (no prompts, responses, names, URLs or paths)."></textarea>
            <div class="cb-note">Standalone CharacterBench: <a href="https://github.com/RayzerCat76/CharacterBenchmark" target="_blank" rel="noreferrer">GitHub</a> · feedback: <a href="https://github.com/RayzerCat76/CharacterBenchmark/issues/1" target="_blank" rel="noreferrer">issues #1</a>. No telemetry.</div>
        </div>
    `;
    container.appendChild(wrapper);

    document.getElementById(`${MODULE_NAME}-refresh`).addEventListener('click', () => refreshCharacter(true));
    document.getElementById(`${MODULE_NAME}-run`).addEventListener('click', () => runSelectedChecks());
    document.getElementById(`${MODULE_NAME}-stop`).addEventListener('click', () => { state.cancelled = true; setStatus('Stopping after the current generation…'); });
    document.getElementById(`${MODULE_NAME}-save`).addEventListener('click', () => saveBaseline());
    document.getElementById(`${MODULE_NAME}-compare`).addEventListener('click', () => showComparison());
    document.getElementById(`${MODULE_NAME}-export`).addEventListener('click', () => exportPacket());
    document.getElementById(`${MODULE_NAME}-length`).addEventListener('change', event => {
        const context = getContextOrNull();
        if (!context) return;
        settings(context).options.responseLength = Math.min(2048, Math.max(16, Number(event.target.value) || 120));
        context.saveSettingsDebounced?.();
    });

    const drawer = document.querySelector(`#${MODULE_NAME}-drawer .inline-drawer-header`);
    drawer?.addEventListener('click', () => { if (!state.character) refreshCharacter(false); });
}

function render() {
    const context = getContextOrNull();
    const statusEl = document.getElementById(`${MODULE_NAME}-status`);
    if (!statusEl) return;

    statusEl.innerHTML = state.error
        ? `<span class="cb-error">${escapeHtml(state.error)}</span>`
        : escapeHtml(state.status);

    const characterEl = document.getElementById(`${MODULE_NAME}-character`);
    if (state.character) {
        const signals = state.signals || {};
        const signalBits = [
            signals.description ? 'description' : null,
            signals.personality ? 'personality' : null,
            signals.scenario ? 'scenario' : null,
            signals.example_dialogue ? 'example dialogue' : null,
            signals.system_prompt ? 'system prompt' : null,
            signals.lore_entries ? `${signals.lore_entries} lore entries` : null,
        ].filter(Boolean).join(', ');
        characterEl.innerHTML = `<b>${escapeHtml(state.character.name)}</b><br><span class="cb-dim">Card fields used: ${escapeHtml(signalBits || 'name only')}</span>`;
    } else {
        characterEl.textContent = 'No character selected.';
    }

    const checksEl = document.getElementById(`${MODULE_NAME}-checks`);
    if (checksEl) {
        if (!state.tests.length) {
            checksEl.innerHTML = '<div class="cb-dim">No checks loaded yet.</div>';
        } else {
            const store = context ? settings(context) : DEFAULT_SETTINGS;
            checksEl.innerHTML = state.tests.map(test => `
                <label class="cb-check">
                    <input type="checkbox" data-cb-test="${escapeHtml(test.id)}" ${store.disabledChecks.includes(test.id) ? '' : 'checked'}>
                    <span><b>${escapeHtml(test.id)}</b> <span class="cb-dim">· ${escapeHtml(test.category)}</span><br>
                    <span class="cb-dim">${escapeHtml(test.description)} (${test.turns.length} turn${test.turns.length === 1 ? '' : 's'})</span></span>
                </label>`).join('');
            for (const box of checksEl.querySelectorAll('input[data-cb-test]')) {
                box.addEventListener('change', () => {
                    if (!context) return;
                    const store = settings(context);
                    const id = box.getAttribute('data-cb-test');
                    store.disabledChecks = box.checked
                        ? store.disabledChecks.filter(item => item !== id)
                        : [...new Set([...store.disabledChecks, id])];
                    context.saveSettingsDebounced?.();
                });
            }
        }
    }

    const lengthEl = document.getElementById(`${MODULE_NAME}-length`);
    if (lengthEl && context) lengthEl.value = String(settings(context).options.responseLength);

    const runBtn = document.getElementById(`${MODULE_NAME}-run`);
    const stopBtn = document.getElementById(`${MODULE_NAME}-stop`);
    const saveBtn = document.getElementById(`${MODULE_NAME}-save`);
    const compareBtn = document.getElementById(`${MODULE_NAME}-compare`);
    const exportBtn = document.getElementById(`${MODULE_NAME}-export`);
    if (runBtn) runBtn.disabled = state.running || !state.tests.length;
    if (stopBtn) stopBtn.disabled = !state.running;
    if (saveBtn) saveBtn.disabled = state.running || !state.lastRun;
    if (exportBtn) exportBtn.disabled = state.running || !state.lastRun;
    if (compareBtn) compareBtn.disabled = state.running || !state.lastRun || !currentBaseline();

    renderResults();
    renderBaseline();
}

function currentBaseline() {
    const context = getContextOrNull();
    if (!context || !state.character) return null;
    const key = characterKey(state.character, state.tests);
    return settings(context).baselines[key] || null;
}

function renderResults() {
    const el = document.getElementById(`${MODULE_NAME}-results`);
    if (!el) return;
    const run = state.lastRun;
    if (!run) { el.innerHTML = ''; return; }

    const categories = Object.entries(run.categories)
        .map(([name, score]) => `<tr><td>${escapeHtml(name)}</td><td>${score}/10</td></tr>`).join('');

    const tests = run.tests.map(test => {
        const reasons = test.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('');
        const snippet = (test.response || '').slice(0, 400);
        return `<details class="cb-test">
            <summary><b>${escapeHtml(test.test_id)}</b> — ${escapeHtml(test.category)} — <b>${test.score}/10</b></summary>
            <ul class="cb-reasons">${reasons}</ul>
            <div class="cb-snippet">${escapeHtml(snippet)}${(test.response || '').length > 400 ? '…' : ''}</div>
        </details>`;
    }).join('');

    el.innerHTML = `
        <div class="cb-overall">Overall: <b>${run.overall}/10</b> <span class="cb-dim">(${run.tests.length} checks · ${escapeHtml(run.provider || '')})</span></div>
        <table class="cb-categories"><tbody>${categories}</tbody></table>
        ${tests}
        ${state.lastComparison ? renderComparisonHtml(state.lastComparison) : ''}`;
}

/** Comparison block, rendered as part of the results so a re-render never drops it. */
function renderComparisonHtml(comparison) {
    const row = (items, label) => items.length
        ? `<div class="cb-compare-row"><b>${label}</b><ul>${items.map(item => `<li>${escapeHtml(item.test_id)} (${escapeHtml(item.category)}): ${item.before ?? '—'} → ${item.after ?? '—'} (${item.delta > 0 ? '+' : ''}${item.delta})</li>`).join('')}</ul></div>`
        : `<div class="cb-compare-row cb-dim"><b>${label}</b>: none</div>`;
    return `
        <div class="cb-comparison">
            <div class="cb-overall">Comparison: <b>${comparison.overall_before} → ${comparison.overall_after}</b> (${comparison.overall_delta > 0 ? '+' : ''}${comparison.overall_delta})</div>
            ${row(comparison.regressions, 'Regressions')}
            ${row(comparison.improvements, 'Improvements')}
            ${row(comparison.unchanged, 'Unchanged')}
            ${comparison.added.length ? row(comparison.added, 'New checks (no baseline value)') : ''}
            ${comparison.removed.length ? row(comparison.removed, 'Checks missing from this run') : ''}
        </div>`;
}

function renderBaseline() {
    const el = document.getElementById(`${MODULE_NAME}-baseline`);
    if (!el) return;
    const baseline = currentBaseline();
    if (!baseline) { el.innerHTML = '<span class="cb-dim">No baseline saved for this character.</span>'; return; }
    el.innerHTML = `<span class="cb-dim">Baseline saved ${escapeHtml(baseline.saved_at)} · overall ${baseline.overall}/10 · ${baseline.tests.length} checks</span>`;
}

/* --------------------------------------------------------------- logic */

function refreshCharacter(announce = true) {
    const context = getContextOrNull();
    if (!context) { setStatus('SillyTavern context unavailable.', true); return; }
    const active = readActiveCharacter(context);
    if (!active.ok) {
        state.character = null; state.tests = []; state.signals = null;
        setStatus(active.reason === 'no-character' ? 'Select a character to begin.' : 'SillyTavern context unavailable.', false);
        return;
    }
    try {
        const { character, signals } = buildCharacterFromFields(active.fields);
        state.character = character;
        state.tests = starterTests(character, active.fields);
        state.signals = signals;
        state.lastRun = null;
        state.lastComparison = null;
        // Always refresh the status line: a silent refresh (on character/chat change) must not
        // leave a stale "select a character" message behind once a character is available.
        setStatus(announce
            ? `Generated ${state.tests.length} starter checks for ${character.name}.`
            : `Loaded ${state.tests.length} starter checks for ${character.name}.`);
        render();
    } catch (error) {
        state.character = null; state.tests = [];
        setStatus(`Could not build checks: ${error.message}`, true);
    }
}

function selectedTests() {
    const context = getContextOrNull();
    const store = context ? settings(context) : DEFAULT_SETTINGS;
    return state.tests.filter(test => !store.disabledChecks.includes(test.id));
}

async function runSelectedChecks() {
    const context = getContextOrNull();
    if (!context || !state.character) { setStatus('Select a character to begin.', true); return; }
    if (typeof context.generateRaw !== 'function') {
        setStatus('This SillyTavern version does not expose generateRaw(); cannot run checks safely.', true);
        return;
    }

    const tests = selectedTests();
    if (!tests.length) { setStatus('No checks selected.', true); return; }

    const store = settings(context);
    const systemPrompt = buildSystemPrompt(state.character);
    const chatBefore = chatLength(context);
    const results = [];

    state.running = true;
    state.cancelled = false;
    render();

    try {
        for (const [index, test] of tests.entries()) {
            if (state.cancelled) break;
            setStatus(`Running ${test.id} (${index + 1}/${tests.length})…`);
            const responses = await generateForTest(context, {
                systemPrompt,
                test,
                responseLength: store.options.responseLength,
                isCancelled: () => state.cancelled,
            });
            const { score, reasons } = scoreTest(responses, test.checks, test.conversation_checks || {});
            results.push({
                test_id: test.id,
                category: test.category,
                description: test.description,
                score,
                response: responses[responses.length - 1] ?? '',
                responses,
                reasons,
            });
        }

        const chatAfter = chatLength(context);
        state.lastRun = buildSummary({
            character: state.character,
            results,
            providerLabel: context.mainApi ?? context.main_api ?? 'SillyTavern generation',
        });
        state.chatUnchanged = chatBefore === null || chatAfter === null ? null : chatBefore === chatAfter;
        if (results.length) {
            state.lastComparison = currentBaseline() ? compareRuns(currentBaseline(), state.lastRun) : null;
        }

        const parts = [`Ran ${results.length} of ${tests.length} checks.`, `Overall ${state.lastRun.overall}/10.`];
        if (state.chatUnchanged === true) parts.push('Chat history unchanged.');
        if (!results.length && state.cancelled) parts.push('Cancelled before the first check finished.');
        setStatus(parts.join(' '));
    } catch (error) {
        setStatus(`Run stopped: ${error.message}`, true);
    } finally {
        state.running = false;
        render();
    }
}

function saveBaseline() {
    const context = getContextOrNull();
    if (!context || !state.lastRun || !state.character) return;
    const store = settings(context);
    const key = characterKey(state.character, state.tests);
    store.baselines[key] = createBaseline(state.lastRun);
    const keys = Object.keys(store.baselines);
    if (keys.length > store.options.baselineLimit) delete store.baselines[keys[0]];
    context.saveSettingsDebounced?.();
    setStatus(`Baseline saved for ${state.character.name} (${state.lastRun.overall}/10).`);
    render();
}

function showComparison() {
    const baseline = currentBaseline();
    if (!baseline || !state.lastRun) return;
    state.lastComparison = compareRuns(baseline, state.lastRun);
    setStatus('Compared against saved baseline.');
}

function exportPacket() {
    if (!state.lastRun) return;
    const packet = buildFeedbackPacket(state.lastRun);
    const textarea = document.getElementById(`${MODULE_NAME}-packet`);
    if (textarea) textarea.value = `${JSON.stringify(packet, null, 2)}\n\n${renderFeedbackMarkdown(packet)}`;
    setStatus('Feedback packet generated (privacy-safe: no prompts, responses, names, URLs or paths).');
}

/* ---------------------------------------------------------------- init */

export function init() {
    buildPanel();
    const context = getContextOrNull();
    if (!context) { setStatus('SillyTavern context unavailable.', true); return; }
    settings(context);

    if (!initialized) {
        const refresh = () => refreshCharacter(false);
        context.eventSource?.on?.(context.eventTypes?.APP_READY, refresh);
        context.eventSource?.on?.(context.eventTypes?.CHAT_CHANGED, refresh);
        context.eventSource?.on?.(context.eventTypes?.CHARACTER_EDITED, refresh);
        initialized = true;
    }

    refreshCharacter(true);
    console.log(`[CharacterBench] extension ${EXTENSION_VERSION} loaded (no telemetry).`);
}

/** Teardown used when the extension is disabled without a page reload. */
export function onDisable() {
    document.getElementById(`${MODULE_NAME}-drawer`)?.remove();
    initialized = false;
}
