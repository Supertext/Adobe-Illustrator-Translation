/*
 * Translation Import.jsx - Adobe Illustrator script (round trip, part 2 of 2)
 * Supertext - Adobe Illustrator Translation
 * https://github.com/Supertext/Adobe-Illustrator-Translation
 *
 * Reads translated XLIFF 1.2 files produced from "Translation Export.jsx"
 * and writes the translations back into the original text frames, matched
 * by the hidden SupertextID tag. Character and paragraph formatting is
 * restored per style run; <g> tags map back to the inline formatting.
 *
 * By default a copy is created per language (<name>_<lang>.ai) and the
 * original document is left untouched. Frames whose text no longer fits
 * (overset text) are reported and selected.
 *
 * Install: see docs/installation-guide.md
 */
#target illustrator

(function () {
    var TAG_NAME = "SupertextID";
    var RUN_DETECTION = "fast"; // must match the export script
    var CHAR_ATTRS = ["textFont", "size", "fillColor", "strokeColor", "strokeWeight", "tracking", "baselineShift",
        "baselinePosition", "capitalization", "underline", "strikeThrough", "horizontalScale", "verticalScale"];
    var PARA_ATTRS = ["justification", "firstLineIndent", "leftIndent", "rightIndent", "spaceBefore", "spaceAfter", "hyphenation"];

    if (!app.documents.length) { alert("Open the original (exported) document first."); return; }
    var doc = app.activeDocument;

    var files = pickFiles();
    if (!files) return;

    var packs = [];
    for (var f = 0; f < files.length; f++) {
        try { packs.push(readXliff(files[f])); }
        catch (e) { alert("Could not read " + files[f].displayName + ":\n" + e.message); return; }
    }

    var opts = showDialog();
    if (!opts) return;

    var out = [];
    if (opts.copies) {
        if (!docFolder(doc)) { alert("Save the original document first."); return; }
        if (!doc.saved) {
            if (!confirm("Save changes to " + doc.name + " first?")) return;
            doc.save();
        }
        var orig = doc.fullName;
        var base = doc.name.replace(/\.[^\.]+$/, "");
        var ext = (doc.name.match(/\.[^\.]+$/) || [".ai"])[0];
        var overwrite = null;
        for (var p = 0; p < packs.length; p++) {
            var lang = packs[p].lang || "translated" + (p + 1);
            var dest = new File(orig.parent.fsName + "/" + base + "_" + lang + ext);
            if (isOpen(dest)) { out.push(lang + ": skipped, close " + dest.displayName + " first."); continue; }
            if (dest.exists) {
                if (overwrite === null) overwrite = confirm("Some translated copies already exist. Overwrite them?");
                if (!overwrite) { out.push(lang + ": skipped (file exists)."); continue; }
                dest.remove();
            }
            if (!orig.copy(dest)) { out.push(lang + ": could not create copy."); continue; }
            var d = app.open(dest);
            var rep = applyPack(d, packs[p]);
            d.save();
            out.push(report(lang, d.name, rep));
        }
    } else {
        out.push(report(packs[0].lang, doc.name, applyPack(doc, packs[0])));
    }
    alert("Import finished\n\n" + out.join("\n\n"));

    // =============================================================== UI

    function pickFiles() {
        var filter = $.os.indexOf("Windows") >= 0
            ? "XLIFF files:*.xlf;*.xliff;*.xml,All files:*.*"
            : function (f) { return f instanceof Folder || /\.(xlf|xliff|xml)$/i.test(f.name); };
        var r = File.openDialog("Select translated XLIFF file(s)", filter, true);
        if (!r) return null;
        return r instanceof Array ? r : [r];
    }

    function showDialog() {
        var d = new Window("dialog", "Import Translation (XLIFF)");
        d.alignChildren = "fill";

        var p = d.add("panel", undefined, "Files");
        p.alignChildren = "left";
        p.margins = 14;
        for (var i = 0; i < packs.length; i++) {
            var k = packs[i];
            p.add("statictext", undefined, (k.lang || "?") + "  -  " + k.count + " paragraphs  -  " + k.file.displayName +
                (k.original && k.original !== doc.name ? "   (exported from " + k.original + "!)" : ""));
        }

        var m = d.add("panel", undefined, "Mode");
        m.alignChildren = "left";
        m.margins = 14;
        var rbCopy = m.add("radiobutton", undefined, "Create a translated copy per language (original stays untouched)");
        var rbHere = m.add("radiobutton", undefined, "Apply to the open document");
        rbCopy.value = true;
        rbHere.enabled = packs.length === 1;

        var cbSel = d.add("checkbox", undefined, "Select text frames with overset text");
        cbSel.value = true;

        var b = d.add("group");
        b.alignment = "right";
        b.add("button", undefined, "Cancel", { name: "cancel" });
        b.add("button", undefined, "Import", { name: "ok" });

        if (d.show() !== 1) return null;
        return { copies: rbCopy.value, select: cbSel.value };
    }

    // ===================================================== XLIFF reading

    function readXliff(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Cannot open file.");
        var s = file.read();
        file.close();
        s = s.replace(/^﻿/, "").replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "");
        XML.ignoreWhitespace = false;
        XML.ignoreComments = true;
        XML.ignoreProcessingInstructions = true;
        var x = new XML(s);
        var pack = { file: file, lang: "", original: "", units: {}, count: 0 };
        eachElement(x, "file", function (fe) {
            if (!pack.lang) pack.lang = String(fe.attribute("target-language"));
            if (!pack.original) pack.original = String(fe.attribute("original"));
            eachElement(fe, "trans-unit", function (u) {
                var m = String(u.attribute("id")).match(/^(.+)_p(\d+)$/);
                if (!m) return;
                var src = null, tgt = null, kids = u.elements();
                for (var i = 0; i < kids.length(); i++) {
                    if (kids[i].localName() === "source") src = kids[i];
                    else if (kids[i].localName() === "target") tgt = kids[i];
                }
                var unit = { source: src ? inline(src, 0, []) : [], target: tgt ? inline(tgt, 0, []) : null };
                if (unit.target && !/\S/.test(plain(unit.target))) unit.target = null;
                (pack.units[m[1]] = pack.units[m[1]] || {})[m[2]] = unit;
                pack.count++;
            });
        });
        if (!pack.lang) {
            var fm = File.decode(file.name).match(/_([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.(xlf|xliff|xml)$/i);
            if (fm) pack.lang = fm[1];
        }
        if (!pack.count) throw new Error("No translation units found.");
        return pack;
    }

    function eachElement(node, name, fn) {
        var kids = node.elements();
        for (var i = 0; i < kids.length(); i++) {
            if (kids[i].localName() === name) fn(kids[i]);
            else eachElement(kids[i], name, fn);
        }
    }

    // Flattens a <source>/<target> into [{text, style}] segments.
    // style 0 = paragraph base style, n = style of run n (from <g id="n">).
    function inline(node, style, segs) {
        var kids = node.children();
        for (var i = 0; i < kids.length(); i++) {
            var c = kids[i], kind = c.nodeKind();
            if (kind === "text") {
                segs.push({ text: String(c).replace(/\r\n|\r|\n/g, "\u0003"), style: style });
            } else if (kind === "element") {
                var n = c.localName();
                if (n === "g") {
                    var gid = parseInt(String(c.attribute("id")).replace(/\D/g, ""), 10);
                    inline(c, isNaN(gid) ? style : gid, segs);
                } else if (n === "x") {
                    if (String(c.attribute("ctype")) === "lb") segs.push({ text: "\u0003", style: style });
                } else if (n === "mrk" || n === "sub") {
                    inline(c, style, segs);
                }
            }
        }
        return segs;
    }

    function plain(segs) {
        var s = "";
        for (var i = 0; i < segs.length; i++) s += segs[i].text;
        return s;
    }

    // ========================================================= applying

    function applyPack(d, pack) {
        var rep = { translated: 0, untranslated: 0, changed: [], missing: 0, dupes: 0, overflow: [] };
        var index = {}, frames = d.textFrames;
        for (var i = 0; i < frames.length; i++) {
            var t = findTag(frames[i]);
            if (t && t.value) {
                if (index[t.value]) rep.dupes++;
                else index[t.value] = frames[i];
            }
        }
        for (var fid in pack.units) {
            if (!pack.units.hasOwnProperty(fid)) continue;
            var tf = index[fid];
            if (!tf) { rep.missing++; continue; }
            var res = withUnlocked(tf, function () { return applyFrame(tf, pack.units[fid], rep); });
            if (res === "changed") rep.changed.push(snippet(tf));
            else if (res === "ok" && overflows(tf)) rep.overflow.push(tf);
        }
        if (opts.select && rep.overflow.length) {
            try { d.selection = null; d.selection = rep.overflow; } catch (e) {}
        }
        return rep;
    }

    function applyFrame(tf, unitMap, rep) {
        var range = storyRange(tf), a = analyze(range), paras = a.paras, changed = false, p, k;

        // Safety: the source text must still match what was exported.
        for (var key in unitMap) {
            if (!unitMap.hasOwnProperty(key)) continue;
            var pi = parseInt(key, 10);
            if (!paras[pi] || plain(unitMap[key].source) !== paras[pi].text) return "changed";
        }

        // Capture styles before replacing the text.
        for (p = 0; p < paras.length; p++) {
            var para = paras[p], u = unitMap[p], brk = para.start + para.text.length;
            para.styles = [];
            for (k = 0; k < para.runs.length; k++) para.styles[k] = readChar(range.characters[para.runs[k].start]);
            para.breakStyle = brk < a.text.length ? readChar(range.characters[brk]) : null;
            var pIdx = para.text.length ? para.start : (brk < a.text.length ? brk : -1);
            para.pstyle = pIdx >= 0 ? readPara(range.characters[pIdx]) : null;
            if (u && u.target) {
                para.segs = u.target;
                changed = true;
                rep.translated++;
            } else {
                if (u) rep.untranslated++;
                para.segs = [];
                for (k = 0; k < para.runs.length; k++) {
                    para.segs.push({ text: para.text.substr(para.runs[k].start - para.start, para.runs[k].len), style: k });
                }
            }
        }
        if (!changed) return "unchanged";

        var parts = [];
        for (p = 0; p < paras.length; p++) parts.push(plain(paras[p].segs));
        range.contents = parts.join("\r");

        // Re-apply formatting: base style, paragraph style, then inline runs.
        var story = storyRange(tf), pos = 0;
        for (p = 0; p < paras.length; p++) {
            var pr = paras[p], len = parts[p].length, hasBreak = p < paras.length - 1;
            var baseStyle = pr.styles[0] || pr.breakStyle;
            if (baseStyle && len) applyChar(story, pos, len, baseStyle);
            if (hasBreak && pr.breakStyle) applyChar(story, pos + len, 1, pr.breakStyle);
            if (pr.pstyle && (len || hasBreak)) applyPara(story, pos, pr.pstyle);
            var off = pos;
            for (var s = 0; s < pr.segs.length; s++) {
                var seg = pr.segs[s], L = seg.text.length, st = pr.styles[seg.style];
                if (L && seg.style > 0 && st && pr.runs[seg.style] && pr.runs[seg.style].key !== pr.runs[0].key) {
                    applyChar(story, off, L, st);
                }
                off += L;
            }
            pos += len + (hasBreak ? 1 : 0);
        }
        return "ok";
    }

    function readChar(r) {
        var ca = r.characterAttributes, o = {};
        for (var i = 0; i < CHAR_ATTRS.length; i++) {
            try { o[CHAR_ATTRS[i]] = ca[CHAR_ATTRS[i]]; } catch (e) {}
        }
        try { o.autoLeading = ca.autoLeading; o.leading = ca.leading; } catch (e2) {}
        return o;
    }

    function setChar(ca, o) {
        for (var i = 0; i < CHAR_ATTRS.length; i++) {
            if (o[CHAR_ATTRS[i]] !== undefined) {
                try { ca[CHAR_ATTRS[i]] = o[CHAR_ATTRS[i]]; } catch (e) {}
            }
        }
        try {
            if (o.autoLeading === true) ca.autoLeading = true;
            else if (o.autoLeading === false) { ca.leading = o.leading; ca.autoLeading = false; }
        } catch (e2) {}
    }

    function readPara(r) {
        var pa = r.paragraphAttributes, o = {};
        for (var i = 0; i < PARA_ATTRS.length; i++) {
            try { o[PARA_ATTRS[i]] = pa[PARA_ATTRS[i]]; } catch (e) {}
        }
        return o;
    }

    function applyPara(story, start, o) {
        try {
            var pa = story.characters[start].paragraphAttributes;
            for (var i = 0; i < PARA_ATTRS.length; i++) {
                if (o[PARA_ATTRS[i]] !== undefined) {
                    try { pa[PARA_ATTRS[i]] = o[PARA_ATTRS[i]]; } catch (e) {}
                }
            }
        } catch (e2) {}
    }

    function applyChar(story, start, len, st) {
        try {
            var r = story.characters[start];
            if (len > 1) r.length = len;
            if (r.length === len) { setChar(r.characterAttributes, st); return; }
        } catch (e) {}
        for (var i = 0; i < len; i++) {
            try { setChar(story.characters[start + i].characterAttributes, st); } catch (e2) {}
        }
    }

    function overflows(tf) {
        try {
            if (tf.kind === TextType.POINTTEXT) return false;
            var vis = "", f = tf;
            while (f) {
                for (var i = 0; i < f.lines.length; i++) vis += f.lines[i].contents;
                try { f = f.nextFrame; } catch (e) { f = null; }
            }
            return vis.replace(/\s/g, "").length < String(storyRange(tf).contents).replace(/\s/g, "").length;
        } catch (e2) {
            return false;
        }
    }

    // =========================================================== report

    function report(lang, name, r) {
        var l = [(lang ? lang + " -> " : "") + name, "  Translated paragraphs: " + r.translated];
        if (r.untranslated) l.push("  Not translated (original kept): " + r.untranslated);
        if (r.changed.length) l.push("  Skipped, text changed since export: " + r.changed.slice(0, 5).join("; "));
        if (r.missing) l.push("  Frames not found (deleted?): " + r.missing);
        if (r.dupes) l.push("  Frames with duplicate IDs (copied after export): " + r.dupes);
        if (r.overflow.length) {
            var s = [];
            for (var i = 0; i < r.overflow.length && i < 5; i++) s.push(snippet(r.overflow[i]));
            l.push("  OVERSET TEXT in " + r.overflow.length + " frame(s): " + s.join("; "));
        }
        return l.join("\n");
    }

    function snippet(tf) {
        var s = String(safe(function () { return tf.contents; })).replace(/[\r\u0003\n]+/g, " ");
        return '"' + (s.length > 30 ? s.substr(0, 30) + "..." : s) + '"';
    }

    // ============================ shared (identical to the export script)

    function findTag(item) {
        try {
            for (var i = 0; i < item.tags.length; i++) if (item.tags[i].name === TAG_NAME) return item.tags[i];
        } catch (e) {}
        return null;
    }

    function storyRange(tf) {
        try { if (tf.kind !== TextType.POINTTEXT && tf.nextFrame) return tf.story.textRange; } catch (e) {}
        return tf.textRange;
    }

    function analyze(range) {
        var text = String(range.contents), runs = getRuns(range, text.length);
        var parts = text.split("\r"), paras = [], pos = 0;
        for (var p = 0; p < parts.length; p++) {
            var end = pos + parts[p].length, para = { start: pos, text: parts[p], runs: [] };
            for (var k = 0; k < runs.length; k++) {
                var s = Math.max(runs[k].start, pos), e = Math.min(runs[k].start + runs[k].len, end);
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
                var trs = range.textRanges, pos = 0;
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

    function withUnlocked(tf, fn) {
        var frames = [tf], undo = [];
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

    function isOpen(file) {
        for (var i = 0; i < app.documents.length; i++) {
            try { if (app.documents[i].fullName.fsName === file.fsName) return true; } catch (e) {}
        }
        return false;
    }

    function docFolder(d) {
        try { if (d.fullName && d.fullName.exists) return d.fullName.parent; } catch (e) {}
        return null;
    }

    function safe(fn) {
        try { var v = fn(); return v == null ? "" : v; } catch (e) { return ""; }
    }
})();
