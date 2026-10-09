# Developer guide

How the scripts work, what the XLIFF looks like, and how to test and release changes.

- [Overview](#overview)
- [ExtendScript constraints](#extendscript-constraints)
- [Text frame IDs](#text-frame-ids)
- [Text model: stories, paragraphs and style runs](#text-model-stories-paragraphs-and-style-runs)
- [XLIFF format](#xliff-format)
- [Import algorithm](#import-algorithm)
- [Shared code](#shared-code)
- [Development setup](#development-setup)
- [Test checklist](#test-checklist)
- [Releasing](#releasing)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

## Overview

| File | Role |
|---|---|
| `scripts/Translation Export.jsx` | Tags frames, analyses text, writes XLIFF 1.2 |
| `scripts/Translation Import.jsx` | Parses XLIFF, matches frames by ID, replaces text, restores formatting |
| `scripts/extras/Export Text.jsx` | Standalone one-way export to CSV / JSON / TXT, no IDs |

Each script is a single self-contained file wrapped in an IIFE, so it can be dropped into the Scripts folder without dependencies. The price is duplicated code between export and import (see [Shared code](#shared-code)).

## ExtendScript constraints

Illustrator scripts run in **ExtendScript**, Adobe's JavaScript dialect:

- **ES3 only.** No `let`/`const`, arrow functions, template literals, `Array.prototype.forEach/map/indexOf`, `JSON` (not built in), or `String.prototype.trim`. Stick to `var`, `for` loops and string concatenation.
- **E4X is available** and is used for XML parsing (`new XML(string)`). Namespaces are handled via `localName()`, so documents with or without the XLIFF default namespace parse the same way.
- **ScriptUI** provides the dialogs (`new Window("dialog")`).
- **File I/O** via `File`/`Folder`. Always set `file.encoding = "UTF-8"`.
- **Performance:** every DOM property access crosses into Illustrator and is slow. Access to `characters[i]` in loops is the main cost, which is why run detection has a fast path.
- **Text model quirks:** paragraphs are separated by `\r`, forced line breaks (Shift+Enter) are `\u0003`.

## Text frame IDs

Each exported frame gets an Illustrator **tag** (`pageItem.tags`) named `SupertextID`. Tags are persisted in the `.ai` file, invisible in the UI, and survive moving, restyling and copy/paste.

```
id = "tf" + Date.now().toString(36) + random(1e8).toString(36)   // e.g. tf1kq3m9x2c4lz
```

`ensureId()` rules:

- An existing tag is reused, so re-exporting a document keeps the same IDs and TM matches stay stable.
- If two frames carry the same ID (a frame was copy-pasted), the first keeps it and the later one gets a new ID on export.
- Tagging needs an unlocked, visible item. `withUnlocked()` temporarily unlocks and shows the frame's parent chain (layers, groups) and restores the state in `finally`.

On import, frames are indexed by tag value. Duplicates are counted and only the first frame is used.

**Removing IDs** (for example before handing a file to a client): run once in **File › Scripts › Other Script…**:

```javascript
var tf = app.activeDocument.textFrames;
for (var i = 0; i < tf.length; i++)
    for (var t = tf[i].tags.length - 1; t >= 0; t--)
        if (tf[i].tags[t].name === "SupertextID") tf[i].tags[t].remove();
```

## Text model: stories, paragraphs and style runs

`analyze(range)` turns a text range into:

```
{ text, paras: [ { start, text, runs: [ { start, len, key } ] } ] }
```

- **Story:** for threaded area text, `storyRange()` returns `tf.story.textRange`, so the whole story is processed once from its first frame. Continuation frames (`previousFrame != null`) are skipped.
- **Paragraphs:** the story text is split on `\r`. `start` is the absolute character offset.
- **Style runs:** consecutive characters with the same `styleKey()` are merged into a run. The key combines font, size, fill colour, underline, strikethrough, baseline shift/position, capitalization and tracking.

### Run detection modes

`RUN_DETECTION` at the top of both scripts:

| Mode | How | Speed |
|---|---|---|
| `"fast"` (default) | Iterates `range.textRanges`, which Illustrator splits at attribute changes. Falls back to `exact` if the summed lengths don't match the text length. | Fast |
| `"exact"` | Reads `characterAttributes` of every character. | Slow on long texts |

`textRanges` granularity is not documented. If tests show inline formatting being lost, switch **both** scripts to `"exact"`, because the run indices that `<g id>` refers to must be computed identically on export and import.

## XLIFF format

XLIFF 1.2, one `<file>` per document and target language, one `<group>` per text frame, one `<trans-unit>` per non-empty paragraph.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="Brochure.ai" source-language="de-CH" target-language="fr-CH" datatype="x-illustrator">
    <header>
      <tool tool-id="supertext-illustrator" tool-name="Supertext Illustrator Translation" tool-version="1.0.0"/>
    </header>
    <body>
      <!-- group id = the frame's SupertextID tag -->
      <group id="tf1kq3m9x2c4lz">
        <!-- context for the translator -->
        <note>Artboard 1 (Cover) | Layer: Text | area text | Helvetica-Bold 24 pt | fixed text box, watch the length</note>
        <!-- trans-unit id = <frame id>_p<paragraph index> -->
        <trans-unit id="tf1kq3m9x2c4lz_p0" xml:space="preserve">
          <!-- run 0 is the paragraph's base style; <g id="2"> = style of run 2 -->
          <source>Jetzt <g id="1">neu</g> im Sortiment<x id="lb1" ctype="lb"/>ab 1. März</source>
          <target>Désormais <g id="1">nouveau</g> dans notre assortiment<x id="lb1" ctype="lb"/>dès le 1er mars</target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>
```

Conventions:

- **Paragraph index** `_pN` is the index in the story's `\r`-split, including empty paragraphs. Empty paragraphs get no unit, so indices can have gaps, which is intended.
- **`<g id="k">`** wraps text whose style differs from run 0. `k` is the run index within the paragraph. Text in run 0's style (including later runs that happen to match it) is emitted untagged.
- **`<x ctype="lb"/>`** is a forced line break (`\u0003`). Literal newlines in a target are also treated as forced line breaks.
- **`<mrk>` and `<sub>`** in targets are unwrapped, and other unknown elements are ignored.
- **`xml:space="preserve"`** keeps leading and trailing spaces.
- **Target language** comes from `target-language`, falling back to a `_xx-YY` suffix in the file name.

## Import algorithm

Per XLIFF file (`applyPack`):

1. Index the document's frames by `SupertextID`.
2. For each frame group in the XLIFF:
   1. **Verify.** Re-analyse the frame. If any unit's `<source>` (flattened to plain text) differs from the current paragraph text, skip the frame as *changed*.
   2. **Capture styles.** For every paragraph, read the character attributes of the first character of each run, the attributes of the paragraph break, and the paragraph attributes.
   3. **Build new text.** Translated paragraphs take their target segments. Untranslated ones are rebuilt from their original runs.
   4. **Replace.** Set `range.contents` to the paragraphs joined by `\r`. This collapses formatting to a single style.
   5. **Restore.** Per paragraph: apply run 0's style to the whole paragraph, the break style to the `\r`, paragraph attributes to the first character, then each `<g id="k">` segment's run style to its character span.
3. **Overset check.** For area and path text, compare the characters visible in `lines` across all threaded frames with the story length, ignoring whitespace.
4. Save the copy and collect the report.

Attributes restored: see `CHAR_ATTRS` and `PARA_ATTRS` in the import script. Character and paragraph *styles* (named styles) are not re-applied: overrides are written as local formatting. Adding `characterStyle`/`paragraphStyle` handling is on the roadmap.

`applyChar()` first tries to set attributes on a range (`characters[start]` with `length = len`) and falls back to per-character writes if Illustrator refuses.

## Shared code

These functions must stay **byte-identical** in both scripts, because export and import must segment text the same way:

`findTag`, `storyRange`, `analyze`, `getRuns`, `pushRun`, `styleKey`, `colorKey`, `withUnlocked`, and the `TAG_NAME` / `RUN_DETECTION` constants.

When you change one, change both, and mention it in the changelog. A future build step could generate both scripts from a shared source with `#include`, but self-contained files are easier to distribute for now.

## Development setup

- **Editor:** VS Code with the [ExtendScript Debugger](https://marketplace.visualstudio.com/items?itemName=Adobe.extendscript-debug) extension. It lets you run a `.jsx` against a running Illustrator, set breakpoints and inspect the DOM.
- **Run without installing:** **File › Scripts › Other Script…** picks up your working copy directly.
- **Syntax check without Illustrator:**

  ```bash
  for f in scripts/*.jsx scripts/extras/*.jsx; do
    sed '/^#target/d' "$f" > /tmp/check.js && node --check /tmp/check.js && echo "OK $f"
  done
  ```

  This only catches syntax errors. Node accepts ES5+ features that ExtendScript doesn't, so review new code for ES3 compatibility by hand.

- **Logging:** `$.writeln()` prints to the debugger console. Remove or guard log calls before committing.

## Test checklist

Build a test document `test/roundtrip.ai` (not committed, because `.ai` files are large) containing:

- [ ] Point text, area text, text on a path
- [ ] A threaded story across two area boxes
- [ ] A paragraph with a **bold** word, a coloured word and a larger word
- [ ] A forced line break (Shift+Enter) and an empty paragraph
- [ ] Text on a locked layer, a hidden layer, inside a group, inside a clipping mask
- [ ] Two artboards plus text on the pasteboard
- [ ] Umlauts and special characters: `äöü ÄÖÜ ß é è à ç € « » – “ ” & <tag>`
- [ ] Left, centred and right aligned paragraphs, a first-line indent

Round trip:

1. Export with targets `fr-CH, it-CH`. Open the XLIFF in a validator or CAT tool: it must parse, with the expected unit count.
2. **Identity test:** copy every `<source>` into a `<target>` and import. The result must be visually identical to the source (text, formatting, alignment).
3. **Real test:** translate with longer text and moved `<g>` tags, then import. Check formatting lands on the right words and overset frames are selected.
4. **Safety tests:** edit one frame before import (it must be reported as changed), delete one frame (not found), duplicate one frame after export (duplicate ID).
5. Run on Windows and macOS, in both run detection modes if time allows.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- There is no build or CI test run yet: run the syntax check above and the test checklist before committing. CodeQL's JavaScript analysis (see below) covers the scripts where it can parse them; ExtendScript-only syntax such as `#target` may make it skip a file.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

## Releasing

1. Update `VERSION` in `Translation Export.jsx` (written into the XLIFF `<tool>`).
2. Add an entry to `CHANGELOG.md`.
3. Run the test checklist.
4. Tag the release: `git tag v1.1.0 && git push --tags`, and attach the two scripts to a GitHub release so users can download them without cloning.

Versioning follows [SemVer](https://semver.org). A change that alters the XLIFF structure or the ID scheme is a **major** version, because existing exported files may no longer import.

## Known limitations and roadmap

**Limitations**

- Untested in Illustrator so far (see status in the README).
- Text in symbols, linked files, graphs and outlined text is not exported.
- Named character and paragraph styles are restored as local overrides.
- Only XLIFF 1.2 is supported. In an XLIFF with several `<file>` elements, the target language is taken from the first one.
- Batch export across many documents isn't available yet.

**Roadmap ideas**

- **CEP or UXP panel:** a dockable panel with export/import buttons, language presets and a clickable list of overset frames.
- **Supertext API integration:** send the XLIFF straight to Supertext and import on completion.
- **XLIFF 2.0** export and import.
- **Batch mode** for a folder of `.ai` files.
- **Named styles:** preserve `characterStyle` / `paragraphStyle` references.
- **Build step:** generate both scripts from a shared source to remove the duplicated code.
