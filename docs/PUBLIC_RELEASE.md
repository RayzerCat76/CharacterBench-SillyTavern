# Public release preparation

Target repository name: **`RayzerCat76/CharacterBench-SillyTavern`**
Status: **local only.** No public repository, release, or announcement exists yet. Creating the
public repo is a separate, explicitly-authorized external write.

## Pre-push checklist (verified locally)

| check | status |
|---|---|
| no credentials, API keys, tokens, cookies or secrets | **clean** — no such files tracked; grep audit across `*.js/*.json/*.md/*.css` returned only benign matches (a fixture sentence, "completion tokens") |
| no local paths that should not be public | **clean** — no `/Users/<name>` paths; the one sandbox reference was removed |
| no test artifacts with private character/chat data | **clean** — fixtures are the standalone project's public fixtures plus a synthetic card authored for these tests; screenshots show only the synthetic fixture character and SillyTavern's built-in UI |
| README states **alpha** | yes — "Extension version: `0.1.0-alpha`" and alpha framing throughout |
| README states **third-party / unofficial** | yes — "not an official SillyTavern extension, not endorsed by SillyTavern" |
| install instructions exactly `Extensions → Install Extension → paste Git repository URL` | yes — README install section |
| no Python dependency | yes — pure ES modules; no Python anywhere in the repo |
| no server plugin | yes — no `plugins/`, no server-side code |
| no telemetry | yes — code contains no network calls of its own; verified in the live network capture |
| no claim of scientific benchmark validity | yes — "diagnostic regression checks, not a general model-quality score"; "scores are not scientifically validated rankings" |
| Apache-2.0 license retained | yes — `LICENSE` copied from the standalone project |
| screenshots/docs suitable for a public repo | yes — `docs/st-panel-loaded.png`, `docs/st-panel-open.png`, `docs/VALIDATION.md` |

Version claims: `manifest.json` declares `minimum_client_version: "1.19.0"`, and both README and
`docs/VALIDATION.md` state that **1.19.0 is the only validated version** — no support is claimed for
older releases.

## Public-install acceptance plan (do NOT run until the public repo exists)

Run this end-to-end against a *fresh* SillyTavern 1.19.0 instance, installing from the real public
GitHub URL through the normal UI:

1. **Install from the public URL** — SillyTavern → **Extensions → Install Extension** → paste
   `https://github.com/RayzerCat76/CharacterBench-SillyTavern`; confirm the manifest echoes
   `0.1.0-alpha` and the folder lands in `data/<handle>/extensions/`.
2. **Fresh reload** — reload the page; confirm no console errors and the app initialises.
3. **Active-character detection** — select a character; confirm the panel shows the name and the
   detected card fields.
4. **One real check run** — enable a single quick check (e.g. `identity`), run it, confirm a score,
   a reason and a response snippet render.
5. **Baseline save** — press *Save as baseline*; confirm the baseline line appears with a timestamp.
6. **Rerun / compare** — run again (optionally after changing the card/model/prompt) and press
   *Compare with baseline*; confirm regressions / improvements / unchanged all render.
7. **Disable / re-enable** — disable the extension: panel gone, app healthy; re-enable: panel back,
   baseline still present.
8. **Uninstall** — delete the extension folder, reload; app loads, no CharacterBench errors.
9. **Chat history unchanged** — record `SillyTavern.getContext().chat.length` before/after every run.
10. **No unexpected external network requests** — capture traffic for the session and confirm the
    only requests are same-origin SillyTavern API calls (plus whatever the user's own configured
    provider normally receives).

Record the results as a short addendum in `docs/VALIDATION.md` (public-install section).

## Draft extensions-channel post (not posted)

> Hey — I've been building a small diagnostic testing tool for character cards and I'm looking for a
> few people to try the alpha.
>
> It's a third-party SillyTavern extension: install straight from a Git URL via **Extensions →
> Install Extension**. No Python, no separate setup — it uses whatever character you have selected
> and whatever model you already have configured.
>
> It generates a handful of starter checks from your current card (identity, persona pressure,
> scenario, a fake-memory trap, lore recall, long-conversation drift). You pick which ones to run, it
> runs them through your configured model, and you can save the result as a baseline. Then change the
> model, prompt, memory or card, rerun, and see what regressed, improved or stayed the same.
>
> It's deliberately small and unpolished — an alpha. It's a diagnostic regression tool, not a model
> leaderboard, and the scores aren't a scientific ranking of anything. No telemetry; everything stays
> local.
>
> What I'm actually looking for: setup problems (install fails, panel doesn't show, run does nothing),
> false positives (it flags behaviour that's genuinely in character), false negatives (it passes
> something clearly broken), or a regression it catches that you'd have missed.
>
> Repo and install notes: <REPO_URL>
