import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSummary, categoryScores, scoreTest, termPresent, normalizeForMatch } from '../src/scoring.js';

const fixtures = new URL('./fixtures/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, fixtures), 'utf8'));

const definitions = read('tests.json');
const expected = read('expected_scores.json');
const character = read('character_demo.json');

const FIXTURES = ['synthetic_good', 'synthetic_generic', 'synthetic_drift', 'demo_responses'];

function runFixture(fixtureName) {
    const responses = read(`${fixtureName}.json`);
    const results = definitions.map(definition => {
        const turns = responses[definition.id];
        assert.ok(turns, `fixture ${fixtureName} is missing responses for ${definition.id}`);
        const { score, reasons } = scoreTest(turns, definition.checks || {}, definition.conversation_checks || {});
        return {
            test_id: definition.id,
            category: definition.category,
            description: definition.description,
            score,
            response: turns[turns.length - 1],
            responses: turns,
            reasons,
        };
    });
    return buildSummary({ character, results, providerLabel: 'fixture' });
}

for (const fixtureName of FIXTURES) {
    test(`scores match standalone v0.2.1-alpha reference: ${fixtureName}`, () => {
        const summary = runFixture(fixtureName);
        const reference = expected[fixtureName];
        assert.equal(summary.overall, reference.overall, 'overall score');
        assert.deepEqual(summary.categories, reference.categories, 'category scores');
        assert.deepEqual(
            summary.tests.map(t => [t.test_id, t.score, t.reasons]),
            reference.tests.map(t => [t.test_id, t.score, t.reasons]),
            'per-test scores and reasons',
        );
    });
}

test('penalty scoring is monotonic: an added failing check never raises a score', () => {
    const base = scoreTest(['hello there'], { max_chars: 500 });
    const more = scoreTest(['hello there'], { max_chars: 500, must_contain_any: ['Aster'] });
    assert.ok(more.score <= base.score);
    assert.equal(base.score, 10);
    assert.equal(more.score, 6.7);
});

test('term matching mirrors Python term_present (word boundaries + CJK)', () => {
    assert.equal(termPresent('I am Aster Vale.', 'Aster'), true);
    assert.equal(termPresent('I am Asterisk.', 'Aster'), false);
    assert.equal(termPresent('我记得这件事', '我记得这件事'), true);
    assert.equal(normalizeForMatch('it’s a — test'), "it's a - test");
});

test('category scores average per category to one decimal', () => {
    const scores = categoryScores([
        { category: 'Identity', score: 10 },
        { category: 'Identity', score: 6.7 },
        { category: 'Memory', score: 0 },
    ]);
    // (10 + 6.7) / 2 === 8.35, which Python's round(x, 1) resolves to 8.3 (the double is
    // 8.34999999999999964...), so the port must produce 8.3 as well.
    assert.deepEqual(scores, { Identity: 8.3, Memory: 0 });
});
