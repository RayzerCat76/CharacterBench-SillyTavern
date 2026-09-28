import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackPacket, renderFeedbackMarkdown, safeCategories, weakTests } from '../src/feedback.js';

const run = {
    character: 'Tavi Rellan',
    provider: 'ollama',
    generated_utc: '2026-09-28T00:00:00Z',
    overall: 6.7,
    categories: { Identity: 10, Personality: 3.3, Lore: 6.7, SecretBucket: 1.1 },
    tests: [
        { test_id: 'identity', category: 'Identity', description: 'Keeps identity.', score: 10, response: 'SECRET RESPONSE', responses: ['SECRET RESPONSE'], reasons: ['PASS: ok'] },
        { test_id: 'persona-pressure', category: 'Personality', description: 'No generic leak.', score: 3.3, response: 'SECRET RESPONSE', responses: ['SECRET RESPONSE'], reasons: ['FAIL: contains forbidden text'] },
        { test_id: 'lore', category: 'Lore', description: 'Lore recall.', score: 6.7, response: 'SECRET RESPONSE', responses: ['SECRET RESPONSE'], reasons: [] },
    ],
};

test('packet excludes private data by default', () => {
    const serialized = JSON.stringify(buildFeedbackPacket(run));
    for (const secret of ['SECRET RESPONSE', 'Tavi Rellan', 'secret', 'persona-pressure', 'description']) {
        assert.equal(serialized.includes(secret), false, `packet must not include ${secret}`);
    }
    // The only URL allowed is the public feedback issue link.
    const urls = serialized.match(/https?:\/\/[^"]+/g) || [];
    assert.deepEqual(urls, ['https://github.com/RayzerCat76/CharacterBenchmark/issues/1']);
});

test('packet mirrors the standalone shape and always links the feedback issue', () => {
    const packet = buildFeedbackPacket(run);
    assert.equal(packet.result_type, 'single');
    assert.equal(packet.characterbench_version, '0.2.1-alpha');
    assert.equal(packet.overall, 6.7);
    assert.equal(packet.provider, 'ollama');
    assert.equal(packet.status, 'ok');
    assert.equal(packet.feedback_url, 'https://github.com/RayzerCat76/CharacterBenchmark/issues/1');
});

test('category whitelist folds unknown categories into Other', () => {
    assert.deepEqual(safeCategories({ Identity: 10, SecretBucket: 1.1, Another: 3.3 }), { Identity: 10, Other: 2.2 });
    assert.deepEqual(safeCategories({ nope: 'text' }), {});
});

test('weak tests are reported without ids or descriptions', () => {
    const weak = weakTests(run.tests);
    // "Lore" is not a whitelisted feedback category, so it folds into Other — matching the
    // standalone tool's safe_categories/weak_tests behaviour.
    assert.deepEqual(weak, [
        { test: 'weak_1', category: 'Personality', score: 3.3 },
        { test: 'weak_2', category: 'Other', score: 6.7 },
    ]);
    assert.equal(weakTests([{ category: 'Identity', score: 10 }]).length, 0);
});

test('markdown rendering is privacy-safe too', () => {
    const markdown = renderFeedbackMarkdown(buildFeedbackPacket(run));
    assert.equal(markdown.includes('SECRET RESPONSE'), false);
    assert.equal(markdown.includes('Tavi Rellan'), false);
    assert.ok(markdown.includes('issues/1'));
    assert.ok(markdown.includes('Overall: **6.7/10**'));
});
