# CharacterBench for SillyTavern — validation record

Extension version `0.1.0-alpha`. Standalone companion: CharacterBench `v0.2.1-alpha`
(Apache-2.0), which is left untouched.

## Environment used for live validation

| item | value |
|---|---|
| SillyTavern | **1.19.0** (release branch, `06bde93`), freshly cloned and built (webpack bundle) |
| Runtime | Node.js v26.5.0 (macOS), server on `127.0.0.1:8000` |
| Model backend | local **Ollama** (`127.0.0.1:11434`), model `qwen3-vl:2b-instruct` |
| ST connection | Chat Completion → **Custom (OpenAI-compatible)** → `http://127.0.0.1:11434/v1` |
| Character used | synthetic V2 card *Tavi Rellan* (`tests/fixtures/card_tavi_v2.json`, name/lore/example dialogue) |
| Install method | SillyTavern's own **Extensions → Install extension** endpoint over a local git URL (`git clone --depth 1`) |

Test instances live outside the repo (`/tmp/st-runtime/...`); nothing in this repository depends on
them. The sandbox SillyTavern was started with `--disableCsrf` **only** because automated settings
saves were being rejected in the headless harness; this has no bearing on the extension.

## Required evidence

| # | requirement | result | how it was established |
|---|---|---|---|
| 1 | extension installs/loads from a Git-style extension directory | **PASS** | `POST /api/extensions/install` with `http://127.0.0.1:8899/CharacterBench-SillyTavern.git` → `200`, cloned to `data/default-user/extensions/CharacterBench-SillyTavern` at commit `0c1c932` |
| 2 | `manifest.json` accepted | **PASS** | installer response echoed `{"version":"0.1.0-alpha","author":"Project 5090","display_name":"CharacterBench",...}`; server log lists `{ type: 'local', name: 'third-party/CharacterBench-SillyTavern' }` |
| 3 | extension appears in SillyTavern | **PASS** | `#characterbench-st-drawer` present in the Extensions panel after load |
| 4 | active character detected | **PASS** | panel showed `Tavi Rellan` + `Card fields used: description, personality, scenario, example dialogue, system prompt, 2 lore entries` |
| 5 | no-character state handled cleanly | **PASS** | with no character selected: status `Select a character to begin.`, `No character selected.`, 0 checks, Run disabled; no exception |
| 6 | starter checks generated | **PASS** | 6 checks for the fixture card: `identity, persona-pressure, scenario, false-memory, lore, long-drift` — identical to the Python importer's output (see parity below) |
| 7 | selected checks run against the configured ST generation path | **PASS** | two live runs through `context.generateRaw()`; ST server log shows the completion request answered by Ollama (e.g. `finish_reason: 'length'`, 48 completion tokens) |
| 8 | no test messages enter real chat history | **PASS** | chat length `1 → 1` before/after both runs; status line reports `Chat history unchanged.`; extension never calls chat-mutating APIs |
| 9 | results render | **PASS** | `Overall: 10/10 (2 checks · openai)`, category table, per-check `PASS:`/`FAIL:` reasons and a response snippet per check |
| 10 | baseline saves | **PASS** | `Save as baseline` → `extensionSettings['characterbench-st'].baselines['Tavi Rellan::2e7f6a8b']` with `{saved_at, overall, categories, tests[]}`; UI shows the baseline line |
| 11 | rerun produces comparison | **PASS** | `Compare with baseline` renders `Comparison: 10 → 10 (0)` with `Regressions / Improvements / Unchanged` sections; the unchanged checks are listed with `before → after (delta)` |
| 12 | reload preserves baseline as intended | **PASS** | baseline + disabled-check selection persisted through ST settings storage and were restored after a full page reload (`Baseline saved 2026-09-28T02:18:41.751Z · overall 10/10 · 2 checks`) |
| 13 | disable / re-enable works | **PASS** | disabling via ST's `extension_settings.disabledExtensions`: panel gone, `SillyTavern` context and chat still healthy, no CharacterBench console output; re-enabling restored the panel **and** the saved baseline |
| 14 | uninstall leaves no runtime breakage | **PASS** | extension folder removed → no panel, app loads, 2 characters load, no CharacterBench errors in console. (The extension's own `characterbench-st` subtree remains in ST settings; harmless, and removed by ST's settings reset.) |
| 15 | no telemetry / no network call beyond normal ST generation | **PASS** | (a) code audit: no `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon` anywhere in `index.js` or `src/`; (b) network capture during the session shows **only** `http://127.0.0.1:8000/...` same-origin ST API calls — zero external hosts |
| 16 | no server plugin | **PASS** | repository contains no `plugins/` directory, no Python, no server-side code; manifest declares no plugin |
| 17 | README contains exact install/use instructions | **PASS** | `README.md`: install via Extensions → Install extension (Git URL) + manual `data/<handle>/extensions/` path, usage steps, uninstall, privacy section |
| 18 | current standalone CharacterBench files remain untouched | **PASS** | standalone clone `git status` clean and still at tag `v0.2.1-alpha`; no public repo or release created in this task |

## Parity with standalone CharacterBench v0.2.1-alpha

Reference output was generated by running the **Python** implementation on the same inputs, then
compared in `tests/`.

| parity area | method | result |
|---|---|---|
| Character-card → character projection | `card_import.import_card_object()` on the fixture V2 card vs `buildCharacterFromFields()` + `starterTests()` | **identical** (deep-equal: character object, signal summary, and the full 6-check list including turn text and check dictionaries) |
| Deterministic scoring | `run_eval.evaluate()` (fixture provider) over 4 fixture response sets vs the ported `scoreTest()` | **identical**: overall score, every category score, every per-test score **and** every `PASS:`/`FAIL:` reason string |
| Scoring shape | penalty formula `max(0, 10 − failures × 10/3)`, rounded to 1 dp | reproduced, including Python's rounding of values like `16.7/2 = 8.35 → 8.3` |
| Category/overall aggregation | mean per category, mean overall, 1 dp | reproduced |
| Feedback packet | `feedback_packet.py` single-run shape + `safe_categories` + `weak_tests` | reproduced field-for-field (including folding non-whitelisted categories into `Other` and `weak_N` naming) |

Two portability details were required to reach exact parity and are documented in code:

1. **Rounding.** `Math.round(x*10)/10` diverges from Python (`8.35*10 === 83.50000000000001`). The
   port uses decimal formatting on the binary value, which matches Python's `round(x, 1)` for every
   value this pipeline produces (asserted against the Python reference for all four fixtures).
2. **Reason formatting.** Failure reasons embed term lists; Python renders them as `['AI', "don't know"]`.
   The port reproduces that repr style so explanations are byte-identical.

## Intentional differences from the standalone tool

| difference | reason |
|---|---|
| No PNG/JSON/CharX file parsing | The extension reads the active character through SillyTavern's resolved card-fields API, so no card export/re-upload and no file-format handling is needed. Card formats are SillyTavern's responsibility. |
| No CLI, no `models.json`, no provider configuration UI | The extension deliberately uses the model/provider already configured in SillyTavern and never stores credentials. |
| Multi-turn tests are replayed as a chat-style message array inside one `generateRaw` call per turn | Uses a supported ST API; keeps the same system prompt + turn sequence as the standalone, without touching chat history. |
| Baselines live in SillyTavern's extension settings instead of CharacterBench report files | Requested persistence mechanism for an extension; still score-metadata-only (no prompts/responses). |
| Baseline key is the character **name** | Deliberate: a baseline must survive the model/prompt/memory/card change being tested. (An earlier key that hashed card content or the check list orphaned baselines on exactly those edits — found and fixed during validation.) |
| Not a benchmark suite runner | MVP scope: the starter checks generated from one card, not the full multi-model suite tooling. |

## Not yet demonstrated / open items

- **Live regression classification end-to-end.** Comparison *rendering* and the `unchanged` path were
  exercised live; regression/improvement classification is covered by unit tests
  (`tests/baseline.test.mjs`) but was not produced by a live model run. The sandbox model
  (`qwen3-vl:2b-instruct`) kept answering in character even after the card instruction was changed,
  so a real drop in score did not occur. A larger/weaker model, or a card whose instruction is
  violated by the model, would produce one.
- **Long-drift check duration.** It is 8 turns, so a full 6-check run is several minutes on a small
  local model. Expect that; the per-check inventory is meant to be trimmed by the user.
- **Client-side settings flush.** In the headless validation instance `saveSettingsDebounced()` did
  not flush to disk (ST logged "Settings not ready" and CSRF rejected saves until the server was
  started with `--disableCsrf`); persistence was therefore proven by round-tripping through ST's own
  settings endpoint. In a normal interactive session the extension only uses the standard
  `extensionSettings` + `saveSettingsDebounced()` path.
- No packaging for the official SillyTavern content repository; not attempted in this task.

## Evidence artifacts

- `docs/st-panel-open.png` — the extension live inside SillyTavern 1.19.0: card fields detected
  (*Tavi Rellan*), the six generated checks with per-check enable boxes, response-length control,
  Run/Stop, Save as baseline, Compare with baseline, the restored baseline line
  (`Baseline saved 2026-09-28T02:18:41.751Z · overall 10/10 · 2 checks`), and the privacy-safe
  feedback packet box.
- `docs/st-panel-loaded.png`, `docs/st-panel-running.png` — earlier captures from the same session.
- CLI evidence captured during validation (text): the ST server log lines for the extension
  discovery (`{ type: 'local', name: 'third-party/CharacterBench-SillyTavern' }`), the webpack
  bundle build, the install endpoint response (`{"version":"0.1.0-alpha",...}`), and the
  Ollama-backed completion (`finish_reason: 'length'`, 48 completion tokens).
- The extension was installed through SillyTavern's own **Install extension** endpoint from a local
  git URL, and the installed checkout is the committed revision `0c1c932`.

Screenshots were taken with the extension panel expanded via SillyTavern's own inline-drawer
toggle (the same handler a user click triggers).
