import test from 'node:test';
import assert from 'node:assert/strict';
import { characterKey, compareRuns, createBaseline, fnv1a } from '../src/baseline.js';

const character = { name: 'Tavi Rellan', identity: ['Name: Tavi Rellan'], system_prompt: 'Stay in character.' };
const tests = [{ id: 'identity' }, { id: 'long-drift' }];

function summary(scores) {
    const results = Object.entries(scores).map(([id, score]) => ({
        test_id: id, category: 'Identity', description: '', score, response: 'private response text', responses: ['private response text'], reasons: [],
    }));
    return { character: character.name, overall: results.reduce((s, r) => s + r.score, 0) / results.length, categories: { Identity: 10 }, tests: results };
}

test('baseline key is stable across edits to the card (the change being tested)', () => {
    const keyA = characterKey(character, tests);
    const keyB = characterKey(character, tests);
    const changedPrompt = characterKey({ ...character, system_prompt: 'Different prompt.' }, tests);
    const changedIdentity = characterKey({ ...character, identity: ['Name: Tavi Rellan', 'Edited description.'] }, tests);
    const changedChecks = characterKey(character, [{ id: 'identity' }]);
    const otherCharacter = characterKey({ ...character, name: 'Seraphina' }, tests);
    assert.equal(keyA, keyB);
    // Card edits and check-list changes must keep the same baseline...
    assert.equal(keyA, changedPrompt);
    assert.equal(keyA, changedIdentity);
    assert.equal(keyA, changedChecks);
    // ...while a different character gets its own baseline.
    assert.notEqual(keyA, otherCharacter);
    assert.match(keyA, /^Tavi Rellan::[0-9a-f]{8}$/);
});

test('baselines store score metadata only (no prompts, responses or transcripts)', () => {
    const baseline = createBaseline(summary({ identity: 10, 'long-drift': 6.7 }), '2026-09-28T00:00:00.000Z');
    const serialized = JSON.stringify(baseline);
    assert.equal(serialized.includes('private response text'), false);
    assert.deepEqual(Object.keys(baseline).sort(), ['categories', 'overall', 'saved_at', 'tests']);
    assert.deepEqual(baseline.tests.map(t => Object.keys(t).sort()), [['category', 'score', 'test_id'], ['category', 'score', 'test_id']]);
});

test('comparison classifies regressions, improvements and unchanged checks', () => {
    const baseline = createBaseline(summary({ identity: 10, 'long-drift': 6.7 }));
    const comparison = compareRuns(baseline, summary({ identity: 6.7, 'long-drift': 10 }));
    assert.deepEqual(comparison.regressions.map(r => r.test_id), ['identity']);
    assert.deepEqual(comparison.improvements.map(r => r.test_id), ['long-drift']);
    assert.equal(comparison.unchanged.length, 0);
    assert.equal(comparison.overall_delta, 0);
});

test('comparison treats small moves as unchanged and reports added/removed checks', () => {
    const baseline = createBaseline(summary({ identity: 10, 'long-drift': 6.7 }));
    const same = compareRuns(baseline, summary({ identity: 10, 'long-drift': 6.7 }));
    assert.equal(same.unchanged.length, 2);
    assert.equal(same.regressions.length, 0);

    const added = compareRuns(baseline, summary({ identity: 10, 'long-drift': 10, lore: 3.3 }));
    assert.deepEqual(added.added.map(a => a.test_id), ['lore']);

    const removed = compareRuns(baseline, summary({ identity: 10 }));
    assert.deepEqual(removed.removed.map(r => r.test_id), ['long-drift']);
});

test('fnv1a is deterministic and 8 hex chars wide', () => {
    assert.equal(fnv1a('characterbench'), fnv1a('characterbench'));
    assert.match(fnv1a('characterbench'), /^[0-9a-f]{8}$/);
    assert.notEqual(fnv1a('a'), fnv1a('b'));
});
