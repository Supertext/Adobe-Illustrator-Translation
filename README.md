# Adobe Illustrator Translation

Round-trip translation for Adobe Illustrator files, by [Supertext](https://www.supertext.com).

Export all text from an `.ai` document to **XLIFF 1.2**, translate it in any CAT tool or TMS (memoQ, Trados, Phrase, …), and import the translations back into the **same text frames with their formatting intact**: one translated copy of the document per language.

```
Brochure.ai ──► Translation Export ──► Brochure_fr-CH.xlf ──► CAT tool / TMS
                                       Brochure_it-CH.xlf          │
                                                                   ▼
Brochure_fr-CH.ai ◄── Translation Import ◄── translated .xlf files
Brochure_it-CH.ai
```

> **Status: 1.0.0, untested in Illustrator.** The scripts are syntax-checked but have not yet been run against real documents. Run the [release checklist](docs/developer-guide.md#test-checklist) on a sample file before using this in production.

## Features

- **Stable frame IDs.** Each text frame gets a hidden ID stored inside the `.ai` file, so translations land in the right frame even if frames are moved.
- **Formatting preserved.** One translation unit per paragraph. A bold word, colour change or size change inside a paragraph becomes an XLIFF `<g>` tag and is restored on import. Forced line breaks become `<x ctype="lb"/>`.
- **Context for translators.** Every frame carries a `<note>` with its artboard, layer, font, size and box type (fixed area boxes are flagged "watch the length").
- **Threaded text** is exported once per story, not once per box.
- **Safe import.** The original stays untouched. Frames edited after export are skipped and reported. Untranslated paragraphs keep the source text. Locked and hidden layers are handled automatically.
- **Overset check.** After import, frames whose translated text no longer fits are listed and selected.

## Quick start

1. Copy the two scripts from [`scripts/`](scripts) into Illustrator's Scripts folder and restart Illustrator ([installation guide](docs/installation-guide.md)).
2. Open your document and run **File › Scripts › Translation Export**. Enter the source and target languages.
3. Translate the `.xlf` files.
4. Open the original document again and run **File › Scripts › Translation Import**. Select the translated `.xlf` files.

## Documentation

| Guide | For |
|---|---|
| [Installation guide](docs/installation-guide.md) | Installing, updating and removing the scripts on Windows and macOS |
| [User guide](docs/user-guide.md) | Designers, project managers and translators running the workflow |
| [Developer guide](docs/developer-guide.md) | Architecture, XLIFF format, testing and releasing |

## Repository layout

```
scripts/
  Translation Export.jsx     export to XLIFF (round trip, part 1)
  Translation Import.jsx     import translated XLIFF (round trip, part 2)
  extras/Export Text.jsx     one-way export of all text to CSV / JSON / TXT
docs/
  installation-guide.md
  user-guide.md
  developer-guide.md
CHANGELOG.md
```

## Requirements

Adobe Illustrator CC 2019 or later on Windows or macOS. No plugins, extensions or Adobe developer account required.
