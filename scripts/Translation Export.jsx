/*
 * Translation Export.jsx - Adobe Illustrator script (round trip, part 1 of 2)
 * Supertext - Adobe Illustrator Translation
 * https://github.com/Supertext/Adobe-Illustrator-Translation
 *
 * Exports all text of the active document to XLIFF 1.2 for translation.
 * Every exported text frame gets a hidden, persistent ID (an Illustrator
 * "tag", saved inside the .ai file), so "Translation Import.jsx" can write
 * the translations back into exactly the same frames, keeping formatting.
 *
 * - One trans-unit per paragraph; threaded text is exported once per story.
 * - Formatting changes inside a paragraph (bold word, colour, size...) are
 *   exported as <g id="n"> inline tags; forced line breaks as <x ctype="lb"/>.
 * - Each frame carries a <note> with artboard, layer, font and box type.
 *
 * Install: see docs/installation-guide.md
 */
#target illustrator

(function () {
    var VERSION = "1.0.0";
    var TAG_NAME = "SupertextID";
    // "fast" reads formatting runs via textRanges. If inline formatting ever
    // goes missing after import, switch BOTH scripts to "exact" (slower).
    var RUN_DETECTION = "fast";

    if (app.documents.length === 0) {
        alert("Open a document first.");
        return;
    }
    var doc = app.activeDocument;

    var opts = showDialog();
    if (!opts) return;

    // ------------------------------------------------------- collect text
    var used = {};
    var items = [];
    var skipped = 0;
    var frames = doc.textFrames;

    for (var i = 0; i < frames.length; i++) {
        var tf = frames[i];
        if (isThreadContinuation(tf)) continue;

        var hidden = isHidden(tf);
        if (hidden && !opts.includeHidden) continue;

        var analysis = analyze(storyRange(tf));
        if (!hasText(analysis)) continue;

        var id = withUnlocked(tf, function () { return ensureId(tf, used); });
        if (!id) { skipped++; continue; }

        var b = tf.geometricBounds;
        var ab = artboardIndexFor(b);
        items.push({ id: id, analysis: analysis, artboard: ab, x: b[0], y: b[1], note: describe(tf, ab, hidden) });
    }

    if (!items.length) {
        alert("No translatable text found in " + doc.name + ".");
        return;
    }

    // Reading order: artboard, then top-to-bottom, then left-to-right.
    items.sort(function (a, b) {
        var aa = a.artboard < 0 ? 99999 : a.artboard;
        var bb = b.artboard < 0 ? 99999 : b.artboard;
        if (aa !== bb) return aa - bb;
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
    });

    // ------------------------------------------------------------ write
    var folder = docFolder(doc) || Folder.selectDialog("Choose where to save the XLIFF files");
    if (!folder) return;

    var base = doc.name.replace(/\.[^\.]+$/, "");
    var targets = opts.targets.length ? opts.targets : [""];
    var written = [];
    var units = 0;

    for (var t = 0; t < targets.length; t++) {
        var f = new File(folder.fsName + "/" + base + (targets[t] ? "_" + targets[t] : "") + ".xlf");
        var x = buildXliff(opts.source, targets[t]);
        units = x.units;
        f.encoding = "UTF-8";
        f.lineFeed = "Unix";
        if (!f.open("w")) { alert("Could not write " + f.fsName); return; }
        f.write(x.text);
        f.close();
        written.push(f.fsName);
    }

    var note;
    if (opts.save && docFolder(doc)) {
        doc.save();
        note = "The document was saved with the text IDs.";
    } else {
        note = "IMPORTANT: save this document. The text IDs needed for the import are stored in it.";
    }

    alert("Exported " + items.length + " text frames (" + units + " paragraphs) to:\n\n" +
        written.join("\n") + "\n\n" + note +
        (skipped ? "\n\n" + skipped + " frame(s) could not be tagged and were skipped." : ""));

    folder.execute();

    // =============================================================== UI

    function showDialog() {
        var d = new Window("dialog", "Export for Translation (XLIFF)");
        d.orientation = "column";
        d.alignChildren = "fill";

        var p = d.add("panel", undefined, "Languages");
        p.alignChildren = "left";
        p.margins = 14;
        var g1 = p.add("group");
        g1.add("statictext", undefined, "Source language:").preferredSize.width = 120;
        var src = g1.add("edittext", undefined, "de-CH");
        src.characters = 10;
        var g2 = p.add("group");
        g2.add("statictext", undefined, "Target languages:").preferredSize.width = 120;
        var tgt = g2.add("edittext", undefined, "fr-CH, it-CH, en-GB");
        tgt.characters = 26;
        p.add("statictext", undefined, "One XLIFF file per target language. Leave empty for a single file.");

        var o = d.add("panel", undefined, "Options");
        o.alignChildren = "left";
        o.margins = 14;
        var cbH = o.add("checkbox", undefined, "Include hidden text (hidden layers, groups, objects)");
        var cbS = o.add("checkbox", undefined, "Save the document after adding text IDs (needed for import)");
        cbS.value = true;

        var btn = d.add("group");
        btn.alignment = "right";
        btn.add("button", undefined, "Cancel", { name: "cancel" });
        btn.add("button", undefined, "Export", { name: "ok" });

        while (true) {
            if (d.show() !== 1) return null;
            var s = parseLangs(src.text);
            var ts = parseLangs(tgt.text);
            if (!s || s.length !== 1) { alert("Enter one source language code, e.g. de-CH."); continue; }
            if (!ts) { alert("Target languages must be codes like fr-CH, it-CH, en-GB (comma separated)."); continue; }
            return { source: s[0], targets: ts, includeHidden: cbH.value, save: cbS.value };
        }
    }

    function parseLangs(s) {
        var out = [];
        var parts = String(s).split(/[,;\s]+/);
        for (var i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(parts[i])) return null;
            out.push(parts[i]);
        }
        return out;
    }

    // =========================================================== XLIFF

    function buildXliff(src, tgt) {
        var x = [];
        var n = 0;
        x.push('<?xml version="1.0" encoding="UTF-8"?>');
        x.push('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">');
        x.push('  <file original="' + esc(doc.name) + '" source-language="' + esc(src) + '"' +
            (tgt ? ' target-language="' + esc(tgt) + '"' : '') + ' datatype="x-illustrator">');
        x.push('    <header>');
        x.push('      <tool tool-id="supertext-illustrator" tool-name="Supertext Illustrator Translation" tool-version="' + VERSION + '"/>');
        x.push('    </header>');
        x.push('    <body>');
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var paras = it.analysis.paras;
            x.push('      <group id="' + esc(it.id) + '">');
            x.push('        <note>' + esc(it.note) + '</note>');
            for (var p = 0; p < paras.length; p++) {
                if (!/\S/.test(paras[p].text)) continue;
                x.push('        <trans-unit id="' + esc(it.id) + '_p' + p + '" xml:space="preserve">');
                x.push('          <source>' + inlineXml(paras[p]) + '</source>');
                x.push('        </trans-unit>');
                n++;
            }
            x.push('      </group>');
        }
        x.push('    </body>');
        x.push('  </file>');
        x.push('</xliff>');
        return { text: x.join("\n") + "\n", units: n };
    }

    function inlineXml(para) {
        var out = "";
        var lb = { n: 0 };
        var baseKey = para.runs.length ? para.runs[0].key : null;
        for (var k = 0; k < para.runs.length; k++) {
            var r = para.runs[k];
            var inner = escBreaks(para.text.substr(r.start - para.start, r.len), lb);
            out += (k === 0 || r.key === baseKey) ? inner : '<g id="' + k + '">' + inner + '</g>';
        }
        return out;
    }

    function escBreaks(t, lb) {
        var parts = t.split("\u0003");
        var s = "";
        for (var i = 0; i < parts.length; i++) {
            if (i) { lb.n++; s += '<x id="lb' + lb.n + '" ctype="lb"/>'; }
            s += esc(parts[i]);
        }
        return s;
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    }

    // ============================================================== IDs

    function findTag(item) {
        try {
            for (var i = 0; i < item.tags.length; i++) if (item.tags[i].name === TAG_NAME) return item.tags[i];
        } catch (e) {}
        return null;
    }

    function ensureId(tf, used) {
        var tag = findTag(tf);
        // Keep an existing ID unless another frame already has it (copy/paste).
        if (tag && tag.value && !used[tag.value]) { used[tag.value] = true; return tag.value; }
        var id;
        do {
            id = "tf" + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e8).toString(36);
        } while (used[id]);
        try {
            if (!tag) { tag = tf.tags.add(); tag.name = TAG_NAME; }
            tag.value = id;
        } catch (e) {
            return null;
        }
        used[id] = true;
        return id;
    }

    // ===================================== analysis (identical in both scripts)

    function storyRange(tf) {
        try { if (tf.kind !== TextType.POINTTEXT && tf.nextFrame) return tf.story.textRange; } catch (e) {}
        return tf.textRange;
    }

    function analyze(range) {
        var text = String(range.contents);
        var runs = getRuns(range, text.length);
        var parts = text.split("\r");
        var paras = [];
        var pos = 0;
        for (var p = 0; p < parts.length; p++) {
            var end = pos + parts[p].length;
            var para = { start: pos, text: parts[p], runs: [] };
            for (var k = 0; k < runs.length; k++) {
                var s = Math.max(runs[k].start, pos);
                var e = Math.min(runs[k].start + runs[k].len, end);
                if (e > s) pushRun(para.runs, s, e - s, runs[k].key);
            }
            paras.push(para);
            pos = end + 1;
        }
        return { text: text, paras: paras };
    }

    function getRuns(range, len) {
        var runs = null;
        if (RUN_DETECTION === "fast") {
            try {
                var trs = range.textRanges;
                var pos = 0;
                runs = [];
                for (var i = 0; i < trs.length; i++) {
                    var l = trs[i].length;
                    if (!l) continue;
                    pushRun(runs, pos, l, styleKey(trs[i].characterAttributes));
                    pos += l;
                }
                if (pos !== len) runs = null;
            } catch (e) {
                runs = null;
            }
        }
        if (!runs) {
            runs = [];
            var ch = range.characters;
            for (var j = 0; j < ch.length; j++) pushRun(runs, j, 1, styleKey(ch[j].characterAttributes));
        }
        return runs;
    }

    function pushRun(runs, start, len, key) {
        var last = runs[runs.length - 1];
        if (last && last.key === key && last.start + last.len === start) last.len += len;
        else runs.push({ start: start, len: len, key: key });
    }

    function styleKey(ca) {
        return [
            safe(function () { return ca.textFont.name; }),
            safe(function () { return ca.size; }),
            safe(function () { return colorKey(ca.fillColor); }),
            safe(function () { return ca.underline; }),
            safe(function () { return ca.strikeThrough; }),
            safe(function () { return ca.baselineShift; }),
            safe(function () { return String(ca.baselinePosition); }),
            safe(function () { return String(ca.capitalization); }),
            safe(function () { return ca.tracking; })
        ].join("|");
    }

    function colorKey(c) {
        if (!c) return "";
        switch (c.typename) {
            case "RGBColor": return "rgb" + c.red + "," + c.green + "," + c.blue;
            case "CMYKColor": return "cmyk" + c.cyan + "," + c.magenta + "," + c.yellow + "," + c.black;
            case "GrayColor": return "gray" + c.gray;
            case "SpotColor": return "spot" + c.spot.name + "@" + c.tint;
            default: return c.typename;
        }
    }

    function hasText(a) {
        for (var p = 0; p < a.paras.length; p++) if (/\S/.test(a.paras[p].text)) return true;
        return false;
    }

    // ========================================================= helpers

    function describe(tf, ab, hidden) {
        var p = [];
        p.push(ab >= 0 ? "Artboard " + (ab + 1) + (doc.artboards[ab].name ? " (" + doc.artboards[ab].name + ")" : "") : "Pasteboard");
        p.push("Layer: " + safe(function () { return tf.layer.name; }));
        p.push(kindName(tf) + " text");
        var font = safe(function () { return tf.textRange.characters[0].characterAttributes.textFont.name; });
        var size = safe(function () { return Math.round(tf.textRange.characters[0].characterAttributes.size * 10) / 10; });
        if (font) p.push(font + (size !== "" ? " " + size + " pt" : ""));
        var name = safe(function () { return tf.name; });
        if (name) p.push("Name: " + name);
        if (tf.kind !== TextType.POINTTEXT) p.push("fixed text box, watch the length");
        if (hidden) p.push("hidden");
        return p.join(" | ");
    }

    function kindName(tf) {
        if (tf.kind === TextType.POINTTEXT) return "point";
        if (tf.kind === TextType.AREATEXT) return "area";
        if (tf.kind === TextType.PATHTEXT) return "path";
        return String(tf.kind);
    }

    function isThreadContinuation(tf) {
        try { return tf.kind !== TextType.POINTTEXT && tf.previousFrame != null; } catch (e) { return false; }
    }

    function isHidden(item) {
        for (var o = item; o && o.typename !== "Document"; o = o.parent) {
            if (o.typename === "Layer") { if (!o.visible) return true; }
            else if (o.hidden) return true;
        }
        return false;
    }

    // Temporarily unlocks/shows the frame's layers and parents, then restores them.
    function withUnlocked(tf, fn) {
        var frames = [tf];
        var undo = [];
        try { for (var n = tf.nextFrame; n; n = n.nextFrame) frames.push(n); } catch (e) {}
        for (var f = 0; f < frames.length; f++) {
            var chain = [];
            for (var o = frames[f]; o && o.typename !== "Document"; o = o.parent) chain.unshift(o);
            for (var c = 0; c < chain.length; c++) {
                var it = chain[c];
                if (it.typename === "Layer") {
                    try { if (!it.visible) { it.visible = true; undo.push([it, "visible", false]); } } catch (e1) {}
                }
                try { if (it.locked) { it.locked = false; undo.push([it, "locked", true]); } } catch (e2) {}
            }
        }
        try {
            return fn();
        } finally {
            for (var u = undo.length - 1; u >= 0; u--) {
                try { undo[u][0][undo[u][1]] = undo[u][2]; } catch (e3) {}
            }
        }
    }

    function artboardIndexFor(b) {
        var cx = (b[0] + b[2]) / 2;
        var cy = (b[1] + b[3]) / 2;
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) return i;
        }
        return -1;
    }

    function docFolder(d) {
        try { if (d.fullName && d.fullName.exists) return d.fullName.parent; } catch (e) {}
        return null;
    }

    function safe(fn) {
        try { var v = fn(); return v == null ? "" : v; } catch (e) { return ""; }
    }
})();
