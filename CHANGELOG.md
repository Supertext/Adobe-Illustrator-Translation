# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-04

### Added

- `Translation Export.jsx`: exports all text frames to XLIFF 1.2, one file per target language, with persistent `SupertextID` frame tags, paragraph-level trans-units, `<g>` inline formatting tags, forced line breaks as `<x ctype="lb"/>` and context notes.
- `Translation Import.jsx`: imports translated XLIFF into per-language copies, restores character and paragraph formatting, skips frames changed since export, reports missing and duplicate frames, and selects overset text.
- `extras/Export Text.jsx`: one-way export of all text to CSV, JSON or plain text.
- Installation guide, user guide and developer guide.

### Known issues

- Not yet tested in Illustrator. Run the test checklist in the developer guide before production use.
