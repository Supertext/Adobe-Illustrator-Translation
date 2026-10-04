# User guide

This guide covers the full translation workflow for Illustrator documents: exporting text, translating it, and importing the translations back.

- [The workflow at a glance](#the-workflow-at-a-glance)
- [Step 1: Export](#step-1-export)
- [Step 2: Translate](#step-2-translate)
- [Step 3: Import](#step-3-import)
- [Reading the import report](#reading-the-import-report)
- [Do's and don'ts](#dos-and-donts)
- [One-way export (CSV / JSON / TXT)](#one-way-export-csv--json--txt)
- [FAQ](#faq)

## The workflow at a glance

| Who | Step | Result |
|---|---|---|
| Designer / PM | Run **Translation Export** on the final source document | One `.xlf` per target language, document saved with text IDs |
| Translator | Translate the `.xlf` in a CAT tool or TMS | Translated `.xlf` files |
| Designer / PM | Run **Translation Import** on the same source document | One translated `.ai` copy per language |
| Designer | Fix overset text and line breaks in each copy | Final translated documents |

The single most important rule: **don't edit the source document's text between export and import.** Frames whose text changed are skipped on import.

## Step 1: Export

1. Open the source document. Make sure the text is final.
2. Choose **File › Scripts › Translation Export**.
3. Fill in the dialog:

| Field | Meaning |
|---|---|
| **Source language** | Language of the document, as a code such as `de-CH`, `en-GB`, `fr`. |
| **Target languages** | Comma-separated codes, for example `fr-CH, it-CH, en-GB`. One XLIFF file is created per language. Leave empty to create a single file without a target language. |
| **Include hidden text** | Also export text on hidden layers or in hidden objects. Off by default. |
| **Save the document after adding text IDs** | On by default. The IDs that link frames to translations are stored in the document, so it must be saved. |

4. Click **Export**. The files are written next to the `.ai` file:

```
Brochure.ai
Brochure_fr-CH.xlf
Brochure_it-CH.xlf
Brochure_en-GB.xlf
```

A summary shows how many frames and paragraphs were exported, and the folder opens.

**What gets exported:** point text, area text and text on a path, on all artboards and the pasteboard, in reading order (artboard, then top to bottom, then left to right). Each paragraph becomes one translation unit. Threaded text boxes are exported as one story.

**What doesn't:** text converted to outlines, text inside symbols, linked or placed files, and raster images. Text in graphs is not supported.

> If the document has never been saved, the script asks for a folder and reminds you to save the document. Unsaved IDs are lost when you close it.

## Step 2: Translate

Send the `.xlf` files to translation, or import them into your CAT tool. XLIFF 1.2 is supported by memoQ, Trados Studio, Phrase, Crowdin, Smartcat, MateCat and most other tools.

Instructions for translators:

- **Keep the inline tags.** `<g>` tags mark formatted words (bold, colour, a different size). Place them around the equivalent words in the translation. `<x>` tags are forced line breaks. You can move or remove them where the translation needs it.
- **Read the notes.** Each text frame has a note with its artboard, layer, font and size. Frames marked *fixed text box, watch the length* have limited space: aim for a translation of similar length.
- **Don't merge or split segments** across trans-units. Each unit is one paragraph in the layout.
- **Return the files under any name.** The target language is read from the file, and the file name is used as a fallback.

## Step 3: Import

1. Open the **original source document** (the one you exported from, saved with the IDs).
2. Choose **File › Scripts › Translation Import**.
3. Select one or more translated `.xlf` files. Hold Ctrl/Cmd to select several languages at once.
4. The dialog lists each file with its language and paragraph count. A warning appears if a file was exported from a different document.

| Option | Meaning |
|---|---|
| **Create a translated copy per language** | Default. Creates `Brochure_fr-CH.ai` etc. next to the original. The original is not modified. |
| **Apply to the open document** | Writes the translation into the open document. Only available for a single file. Use with care. |
| **Select text frames with overset text** | Selects frames whose text no longer fits, so you can find them right away. |

5. Click **Import**. Each translated copy is created, filled, saved and left open.

If a translated copy already exists, you're asked whether to overwrite it. Close any open copy before re-importing.

## Reading the import report

After the import, a summary appears per language:

```
fr-CH -> Brochure_fr-CH.ai
  Translated paragraphs: 142
  Not translated (original kept): 3
  Skipped, text changed since export: "Frühlingsaktion bis 31. Mai..."
  Frames not found (deleted?): 1
  OVERSET TEXT in 2 frame(s): "Découvrez notre nouvelle coll..."
```

| Line | What it means | What to do |
|---|---|---|
| **Translated paragraphs** | Paragraphs written successfully. | Nothing. |
| **Not translated** | The XLIFF had no target for these paragraphs. The source text was kept. | Check with the translator, or translate manually. |
| **Skipped, text changed since export** | The frame's text in the document no longer matches the exported source, so the translation was not written to avoid mismatches. | Translate these frames manually, or re-export and send the changed frames again. |
| **Frames not found** | A frame with this ID no longer exists. It was deleted, or you opened a different document. | Make sure you opened the original source document. |
| **Duplicate IDs** | A frame was copied after export, so two frames share an ID. Only the first receives the translation. | Translate the copy manually. |
| **OVERSET TEXT** | The translated text doesn't fit the area box. These frames are selected. | Enlarge the box, reduce the size or shorten the translation. |

## Do's and don'ts

**Do**

- Export from the final, approved source document.
- Keep the source document (saved with IDs) until all languages are imported.
- Review every translated copy: line breaks, hyphenation and overset text always need a designer's eye.
- Re-run the export after larger source changes. Existing IDs are kept, so translation memory matches still work.

**Don't**

- Edit, add or delete text in the source between export and import.
- Run the import on a translated copy. Always import into the source.
- Convert text to outlines before exporting.
- Rename or delete the `_p0`, `_p1` … trans-unit IDs in the XLIFF.

## One-way export (CSV / JSON / TXT)

`scripts/extras/Export Text.jsx` exports all text to a spreadsheet, JSON or plain-text file, without IDs or import. Use it for proofreading, character counts or quotes. The CSV opens directly in Excel with correct umlauts and uses semicolons by default (for German and Swiss regional settings).

## FAQ

**Does the export change my document?**
It adds an invisible ID to each exported text frame and saves the document. Nothing visible changes.

**Can I export several documents at once?**
Not yet. Run the export per document.

**Are fonts changed for languages with special characters?**
No. The import keeps the original font. If a font lacks glyphs for a language (for example Polish or Czech characters), Illustrator shows missing-glyph boxes, so check those copies carefully.

**Right-to-left languages (Arabic, Hebrew)?**
Text is written in correctly, but Illustrator needs the Middle Eastern text engine and paragraph direction settings for proper display. Expect manual layout work.

**What if the translator returns XLIFF 2.0?**
Only XLIFF 1.2 is supported. Most tools can export 1.2 if you set the format when you create the project.
