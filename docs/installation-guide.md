# Installation guide

The tools are plain Illustrator scripts (`.jsx`). There is nothing to compile and no extension to sign: you copy two files into a folder and restart Illustrator.

## Requirements

- Adobe Illustrator on Windows or macOS. The scripts use only long-standing ExtendScript APIs and are expected to work in CC 2019 and later; the current release target is Illustrator 2025/2026.
- Write access to Illustrator's program folder (admin rights on most company machines), **or** use the no-install option below.

## 1. Download

Download the repository as a ZIP (**Code › Download ZIP** on GitHub) or clone it:

```bash
git clone https://github.com/Supertext/Adobe-Illustrator-Translation.git
```

You need these two files from the `scripts/` folder:

- `Translation Export.jsx`
- `Translation Import.jsx`

Optionally also `scripts/extras/Export Text.jsx` (one-way CSV/JSON/TXT export).

## 2. Copy into the Scripts folder

Replace `2026` with your Illustrator version and `en_US` with your Illustrator language (for example `de_DE`, `fr_FR`).

**Windows**

```
C:\Program Files\Adobe\Adobe Illustrator 2026\Presets\en_US\Scripts\
```

**macOS**

```
/Applications/Adobe Illustrator 2026/Presets.localized/en_US/Scripts/
```

On macOS, Finder may ask for an administrator password when you copy into the Applications folder.

Not sure which language folder is active? Look inside `Presets`: there is usually only one locale folder, and it already contains a `Scripts` subfolder.

### Rolling out to many machines (Windows)

```powershell
$version = "2026"; $locale = "en_US"
$dest = "C:\Program Files\Adobe\Adobe Illustrator $version\Presets\$locale\Scripts"
Copy-Item ".\scripts\Translation Export.jsx", ".\scripts\Translation Import.jsx" -Destination $dest -Force
```

Run from an elevated PowerShell in the repository folder, or deploy the same copy step through Intune or your software distribution tool.

## 3. Restart Illustrator and verify

Quit and restart Illustrator. Open any document and check **File › Scripts**. You should see:

- **Translation Export**
- **Translation Import**

If they don't appear, see [Troubleshooting](#troubleshooting).

## No-install option

You can run the scripts without copying them anywhere: **File › Scripts › Other Script…** (Ctrl+F12 / Cmd+F12), then choose the `.jsx` file. This is useful for testing or on machines without admin rights.

## Optional: keyboard shortcut

Illustrator can't assign shortcuts to scripts directly. The workaround is an Action:

1. Open **Window › Actions** and create a new set, for example "Supertext".
2. Create a new action, for example "Translation Export", and assign a function key (F2–F12) in the dialog.
3. In the Actions panel menu, choose **Insert Menu Item…**, then pick **File › Scripts › Translation Export**.
4. Stop recording.

Repeat for the import. Note: Actions referencing scripts can lose the link after Illustrator updates. Re-insert the menu item if the shortcut stops working.

## Updating

Overwrite the two `.jsx` files with the new versions and restart Illustrator. Check [CHANGELOG.md](../CHANGELOG.md) first: always update **both** scripts together, because they share the ID and formatting logic.

Text IDs already stored in documents stay valid across updates.

## Uninstalling

Delete the two `.jsx` files from the Scripts folder and restart Illustrator.

The hidden IDs remain in documents that were exported. They are invisible, don't affect printing or PDF export, and can be ignored. See the [developer guide](developer-guide.md#text-frame-ids) if you need to remove them.

## Troubleshooting

| Problem | Fix |
|---|---|
| Scripts don't appear in **File › Scripts** | Check that you used the correct version and locale folder and restarted Illustrator completely. |
| "Access denied" when copying (Windows) | Copy with an administrator account, or use **Other Script…**. |
| macOS warns about running a script | Confirm the prompt. Scripts are plain text and can be inspected in any editor. |
| Script runs but shows an error line number | Make sure the file wasn't changed by an editor that converts encoding. Download it again from GitHub. |
