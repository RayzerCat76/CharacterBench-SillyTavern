# CharacterBench for SillyTavern

Small local **diagnostic regression-testing** extension for character AI. It runs
CharacterBench's repeatable character checks against the character you currently have selected
in SillyTavern, using the model/provider SillyTavern is already configured with.

> Diagnostic regression checks — not a general model-quality score.
> Scores are diagnostic signals, not scientifically validated rankings.

This is the SillyTavern companion to the standalone **CharacterBench** project
([GitHub](https://github.com/RayzerCat76/CharacterBenchmark) · v0.2.1-alpha). It is an
independent local tool that *interacts* with SillyTavern — it is **not** an official SillyTavern
extension and is not endorsed by SillyTavern. It installs only as a third-party extension; it does
not modify SillyTavern core or require a server plugin.

Extension version: `0.1.0-alpha`.

## What it does

1. Reads the **currently selected character** using SillyTavern's supported card-fields API.
2. Generates the same **starter checks** the standalone tool creates from a Character Card
   (identity, persona pressure, scenario, false memory, lore recall where a lorebook exists,
   Chinese characterization where the card is CJK, and long-conversation drift).
3. Lets you **review and disable** checks you do not care about.
4. **Runs** the selected checks through SillyTavern's configured generation path.
5. Shows an **overall diagnostic result**, per-category scores, per-check results, the failure
   reason, and a short response snippet.
6. **Save as baseline**, then change the model/prompt/memory/card, **run again**, and see
   **regressions, improvements and unchanged checks**.
7. **Export feedback** as a privacy-safe packet.

## Install — Extensions → Install Extension → paste the Git repository URL

SillyTavern installs extensions directly from a Git repository URL:

1. Open SillyTavern → **Extensions** (the plug icon) → **Install Extension**.
2. Paste the Git repository URL: `https://github.com/RayzerCat76/CharacterBench-SillyTavern`.
3. Install, then reload the page (SillyTavern usually asks).

The extension directory must contain `manifest.json` at its root, which this repository does.
SillyTavern loads third-party extensions as ES modules from
`/scripts/extensions/third-party/<name>/`, and this extension's relative imports
(`./src/*.js`) are served from that same route.

### Manual install (no Git)

Copy this whole folder into your user extensions directory:

```
<SillyTavern>/data/<your-user-handle>/extensions/CharacterBench-SillyTavern/
```

Then reload SillyTavern. The folder must keep `manifest.json` at its root.

### Requirements

- **SillyTavern 1.19.0 or newer.** 1.19.0 is the only version that has been
  validated (see `docs/VALIDATION.md`); older versions are neither tested nor claimed.
- A configured model/provider in SillyTavern that can chat (Ollama, OpenAI-compatible, etc.).
- A character selected.
- No Python, no Node build step, no separate Ollama configuration, no CharacterBench server,
  no SillyTavern server plugin.

## Use

1. Open the **Extensions** panel and expand **CharacterBench**.
2. Press **Load checks for current character** (also happens automatically when the panel opens).
3. Untick any checks you do not want.
4. Set **Max response length** if you want shorter/longer generations (default 120).
5. Press **Run selected checks**. Progress is shown; **Stop** cancels after the current
   generation.
6. Review the overall score, category scores, per-check reasons and response snippets.
7. Press **Save as baseline**.
8. Change the model / prompt / memory / card, then run again and press
   **Compare with baseline** to see regressions, improvements and unchanged checks.
9. Press **Export feedback packet** to get a privacy-safe summary you can paste into
   <https://github.com/RayzerCat76/CharacterBenchmark/issues/1>.

## Uninstall

- **Disable** the extension in the Extensions panel (its panel is removed), or
- delete the extension folder (`data/<handle>/extensions/CharacterBench-SillyTavern/`) and
  reload. Removing it leaves no other state behind: everything this extension stores lives in
  SillyTavern's own extension settings under the `characterbench-st` key.

## Privacy and safety

- **No telemetry, no analytics, no hidden network requests.** The extension makes no network
  calls of its own; the only outbound traffic is the generation request SillyTavern would
  normally send for your configured model.
- **No credential access.** API keys, tokens, session cookies and endpoints are never read,
  logged or stored.
- **Chat history is untouched.** Test generations use `context.generateRaw()`, which does not
  write messages into the chat. The extension never calls chat-mutating APIs.
- **Your character card is never modified**, and you never have to export or re-upload it.
- **Baselines store score metadata only** — no prompts, no responses, no transcripts.
- **Feedback packets exclude** full prompts, generated responses, chat history, character names,
  endpoint URLs, API keys and local paths. Only category scores and weak-check scores are
  included, matching the standalone CharacterBench feedback philosophy.
- **No server plugin**, and nothing is installed outside the extension folder.

## Parity with the standalone tool

The check generation and scoring code is a direct port of CharacterBench `v0.2.1-alpha`
(`card_import.py` / `run_eval.py` / `feedback_packet.py`): the same starter checks, the same
penalty-based scoring (`10 - failures × 10/3`, one decimal), the same term matching, the same
category averaging, and the same privacy-safe packet shape. `tests/` verifies this against
reference output captured from the Python implementation.

Known, deliberate differences from the standalone tool are listed in
[`docs/VALIDATION.md`](docs/VALIDATION.md).

## Development

```bash
npm test          # pure-logic tests (checks, scoring, baseline, feedback)
```

No build step; the extension ships as plain ES modules.

## License

Apache-2.0 (same as the standalone CharacterBench release).
