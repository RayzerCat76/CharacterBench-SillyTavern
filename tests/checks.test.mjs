import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCharacterFromFields, starterTests, salientTerms, loreLines } from '../src/checks.js';

const fixtures = new URL('./fixtures/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, fixtures), 'utf8'));

/** Simulate what SillyTavern's getCharacterCardFields() hands the extension. */
function resolvedFieldsFromCard(card) {
    const data = card.data ?? card;
    return {
        name: data.name,
        description: data.description ?? '',
        personality: data.personality ?? '',
        scenario: data.scenario ?? '',
        firstMes: data.first_mes ?? '',
        mesExamples: data.mes_example ?? '',
        systemPrompt: data.system_prompt ?? '',
        postHistory: data.post_history_instructions ?? '',
        characterBook: data.character_book ?? null,
    };
}

test('character projection matches the standalone importer (v0.2.1-alpha reference)', () => {
    const card = read('card_tavi_v2.json');
    const expected = read('expected_import_tavi_v2.json');
    const { character, signals } = buildCharacterFromFields(resolvedFieldsFromCard(card));

    assert.deepEqual(character, expected.character, 'character projection must match Python reference');
    assert.deepEqual(signals, expected.preview.signals, 'signal summary must match Python reference');
});

test('starter checks match the standalone importer exactly (ids, order, canned checks)', () => {
    const card = read('card_tavi_v2.json');
    const expected = read('expected_import_tavi_v2.json');
    const { character } = buildCharacterFromFields(resolvedFieldsFromCard(card));
    const tests = starterTests(character, resolvedFieldsFromCard(card));

    assert.deepEqual(tests, expected.tests, 'starter checks must match Python reference');
    assert.deepEqual(tests.map(t => t.id), ['identity', 'persona-pressure', 'scenario', 'false-memory', 'lore', 'long-drift']);
});

test('CJK cards add the Chinese characterization check', () => {
    const fields = {
        name: '林清',
        description: '一个记录员。',
        personality: '谨慎，说话很简短。',
        scenario: '在档案馆里核对记录。',
        firstMes: '“先看记录。”',
        mesExamples: '',
        systemPrompt: '',
        postHistory: '',
        characterBook: null,
    };
    const { character } = buildCharacterFromFields(fields);
    const tests = starterTests(character, fields);
    assert.ok(tests.some(t => t.id === 'chinese-characterization'));
});

test('cards without scenario/lore omit those checks', () => {
    const fields = {
        name: 'Minimal',
        description: 'A minimal card.',
        personality: '',
        scenario: '',
        firstMes: '',
        mesExamples: '',
        systemPrompt: '',
        postHistory: '',
        characterBook: null,
    };
    const { character } = buildCharacterFromFields(fields);
    const tests = starterTests(character, fields);
    assert.deepEqual(tests.map(t => t.id), ['identity', 'persona-pressure', 'false-memory', 'long-drift']);
});

test('salient terms and lore flattening behave like the Python helpers', () => {
    assert.deepEqual(salientTerms('A rumor is not a record. Alarms are evidence of a problem.', 4), ['rumor', 'record', 'Alarms', 'evidence']);
    const { lines, count } = loreLines({ entries: [
        { keys: ['Vault Nine'], content: 'Sealed bay.' },
        { keys: [], name: 'Meridian', content: 'A survey ship.' },
        { keys: ['Empty'], content: '' },
    ] });
    assert.equal(count, 2);
    assert.deepEqual(lines, ['Vault Nine: Sealed bay.', 'Meridian: A survey ship.']);
});

test('a nameless card is rejected', () => {
    assert.throws(() => buildCharacterFromFields({ name: '   ' }), /no name/i);
});
