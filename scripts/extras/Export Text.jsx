/*
 * Export Text.jsx — Adobe Illustrator script
 * Exports every text frame (point, area and path text) from the active
 * document or from all open documents to CSV, JSON or plain text.
 *
 * Install: copy into Illustrator's Presets/<locale>/Scripts folder and
 * restart Illustrator. It then appears under File > Scripts > Export Text.
 */
#target illustrator

(function () {
    if (app.documents.length === 0) {
        alert("Open a document first.");
        return;
    }

    var opts = showDialog();
    if (!opts) return;

    var docs = [];
    if (opts.allDocs) {
        for (var i = 0; i < app.documents.length; i++) docs.push(app.documents[i]);
    } else {
        docs.push(app.activeDocument);
    }

    var fallbackFolder = null;
    var written = [];
    var total = 0;

    for (var d = 0; d < docs.length; d++) {
        var doc = docs[d];
        var items = collect(doc, opts);
        total += items.length;

        var folder = docFolder(doc);
        if (!folder) {
            if (!fallbackFolder) {
                fallbackFolder = Folder.selectDialog("Unsaved document - choose where to save the text export");
                if (!fallbackFolder) return;
            }
            folder = fallbackFolder;
        }

        var base = doc.name.replace(/\.[^\.]+$/, "");
        var file = new File(folder.fsName + "/" + base + "_text." + opts.format);

        var out;
        if (opts.format === "csv") out = toCsv(items, opts.semicolon ? ";" : ",");
        else if (opts.format === "json") out = toJson(doc, items);
        else out = toTxt(doc, items);

        writeFile(file, out, opts.format === "csv");
        written.push(file);
    }

    var msg = "Exported " + total + " text item" + (total === 1 ? "" : "s") + " to:\n";
    for (var w = 0; w < written.length; w++) msg += "\n" + written[w].fsName;
    alert(msg);

    if (opts.reveal && written.length) written[0].parent.execute();

    // ---------------------------------------------------------------- UI

    function showDialog() {
        var dlg = new Window("dialog", "Export Text");
        dlg.orientation = "column";
        dlg.alignChildren = "fill";

        var pFmt = dlg.add("panel", undefined, "Format");
        pFmt.orientation = "row";
        pFmt.margins = 14;
        var rbCsv = pFmt.add("radiobutton", undefined, "CSV (Excel)");
        var rbJson = pFmt.add("radiobutton", undefined, "JSON");
        var rbTxt = pFmt.add("radiobutton", undefined, "Plain text");
        rbCsv.value = true;

        var pScope = dlg.add("panel", undefined, "Documents");
        pScope.orientation = "row";
        pScope.margins = 14;
        var rbActive = pScope.add("radiobutton", undefined, "Active document");
        var rbAll = pScope.add("radiobutton", undefined, "All open documents (" + app.documents.length + ")");
        rbActive.value = true;

        var pOpt = dlg.add("panel", undefined, "Options");
        pOpt.alignChildren = "left";
        pOpt.margins = 14;
        var cbHidden = pOpt.add("checkbox", undefined, "Include hidden text (hidden layers, groups, objects)");
        var cbEmpty = pOpt.add("checkbox", undefined, "Include empty text frames");
        var cbSemi = pOpt.add("checkbox", undefined, "CSV: use semicolons (Excel with German/Swiss regional settings)");
        var cbReveal = pOpt.add("checkbox", undefined, "Open the output folder when done");
        cbSemi.value = true;
        cbReveal.value = true;

        rbCsv.onClick = rbJson.onClick = rbTxt.onClick = function () { cbSemi.enabled = rbCsv.value; };

        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "Cancel", { name: "cancel" });
        btns.add("button", undefined, "Export", { name: "ok" });

        if (dlg.show() !== 1) return null;

        return {
            format: rbCsv.value ? "csv" : (rbJson.value ? "json" : "txt"),
            allDocs: rbAll.value,
            includeHidden: cbHidden.value,
            includeEmpty: cbEmpty.value,
            semicolon: cbSemi.value,
            reveal: cbReveal.value
        };
    }

    // ---------------------------------------------------------- collecting

    function collect(doc, opts) {
        var res = [];
        var frames = doc.textFrames;

        for (var i = 0; i < frames.length; i++) {
            var tf = frames[i];

            // Threaded area text: export the whole story once, from its first frame.
            if (isThreadContinuation(tf)) continue;

            var hidden = isHidden(tf);
            if (hidden && !opts.includeHidden) continue;

            var text = normalize(getText(tf));
            if (!opts.includeEmpty && /^\s*$/.test(text)) continue;

            var b = tf.geometricBounds; // [left, top, right, bottom]
            var ab = artboardIndexFor(doc, b);

            res.push({
                id: i + 1,
                artboard: ab,
                artboardName: ab >= 0 ? doc.artboards[ab].name : "",
                layer: safe(function () { return tf.layer.name; }),
                kind: kindName(tf),
                font: safe(function () { return tf.textRange.characters[0].characterAttributes.textFont.name; }),
                size: safe(function () { return round(tf.textRange.characters[0].characterAttributes.size); }),
                x: round(b[0]),
                y: round(b[1]),
                hidden: hidden,
                text: text
            });
        }

        // Reading order: artboard, then top-to-bottom, then left-to-right.
        res.sort(function (a, b) {
            var aa = a.artboard < 0 ? 99999 : a.artboard;
            var bb = b.artboard < 0 ? 99999 : b.artboard;
            if (aa !== bb) return aa - bb;
            if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
            return a.x - b.x;
        });
        return res;
    }

    function getText(tf) {
        try {
            if (tf.kind !== TextType.POINTTEXT && tf.nextFrame) return tf.story.textRange.contents;
        } catch (e) {}
        return tf.contents;
    }

    function isThreadContinuation(tf) {
        try {
            return tf.kind !== TextType.POINTTEXT && tf.previousFrame != null;
        } catch (e) {
            return false;
        }
    }

    function isHidden(item) {
        var o = item;
        while (o && o.typename !== "Document") {
            if (o.typename === "Layer") {
                if (!o.visible) return true;
            } else if (o.hidden) {
                return true;
            }
            o = o.parent;
        }
        return false;
    }

    function artboardIndexFor(doc, b) {
        var cx = (b[0] + b[2]) / 2;
        var cy = (b[1] + b[3]) / 2;
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect; // [left, top, right, bottom]
            if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) return i;
        }
        return -1; // on the pasteboard
    }

    function kindName(tf) {
        if (tf.kind === TextType.POINTTEXT) return "point";
        if (tf.kind === TextType.AREATEXT) return "area";
        if (tf.kind === TextType.PATHTEXT) return "path";
        return String(tf.kind);
    }

    function docFolder(doc) {
        try {
            if (doc.fullName && doc.fullName.exists) return doc.fullName.parent;
        } catch (e) {}
        return null;
    }

    // ------------------------------------------------------------- output

    function toCsv(items, sep) {
        var cols = ["id", "artboard", "artboard_name", "layer", "type", "font", "size", "x", "y", "hidden", "chars", "text"];
        var rows = [cols.join(sep)];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var vals = [it.id, it.artboard >= 0 ? it.artboard + 1 : "", it.artboardName, it.layer, it.kind,
                        it.font, it.size, it.x, it.y, it.hidden ? "yes" : "no", it.text.length, it.text];
            var cells = [];
            for (var c = 0; c < vals.length; c++) cells.push(csvCell(vals[c], sep));
            rows.push(cells.join(sep));
        }
        return rows.join("\r\n") + "\r\n";
    }

    function csvCell(v, sep) {
        var s = v == null ? "" : String(v);
        if (s.indexOf('"') >= 0 || s.indexOf(sep) >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
            s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function toJson(doc, items) {
        var parts = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            parts.push("    {" +
                '"id": ' + it.id +
                ', "artboard": ' + (it.artboard >= 0 ? it.artboard + 1 : "null") +
                ', "artboardName": ' + js(it.artboardName) +
                ', "layer": ' + js(it.layer) +
                ', "type": ' + js(it.kind) +
                ', "font": ' + js(it.font) +
                ', "size": ' + (it.size === "" ? "null" : it.size) +
                ', "x": ' + it.x +
                ', "y": ' + it.y +
                ', "hidden": ' + (it.hidden ? "true" : "false") +
                ', "text": ' + js(it.text) +
                "}");
        }
        return "{\n" +
            '  "document": ' + js(doc.name) + ",\n" +
            '  "exported": ' + js(new Date().toString()) + ",\n" +
            '  "count": ' + items.length + ",\n" +
            '  "items": [\n' + parts.join(",\n") + "\n  ]\n}\n";
    }

    function toTxt(doc, items) {
        var out = [];
        var current = null;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.artboard !== current) {
                current = it.artboard;
                if (out.length) out.push("");
                out.push(current >= 0
                    ? "=== Artboard " + (current + 1) + (it.artboardName ? ": " + it.artboardName : "") + " ==="
                    : "=== Pasteboard (outside artboards) ===");
                out.push("");
            }
            out.push(it.text);
            out.push("");
        }
        return out.join("\n");
    }

    function writeFile(file, content, bom) {
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) throw new Error("Could not write " + file.fsName);
        if (bom) file.write("\uFEFF"); // so Excel detects UTF-8 (umlauts, accents)
        file.write(content);
        file.close();
    }

    // ------------------------------------------------------------ helpers

    function normalize(s) {
        // Illustrator uses \r for paragraphs and \u0003 for forced line breaks.
        return String(s).replace(/\r\n?|\u0003/g, "\n");
    }

    function js(s) {
        return '"' + String(s == null ? "" : s)
            .replace(/\\/g, "\\\\").replace(/"/g, '\\"')
            .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
            .replace(/[\u0000-\u001f]/g, function (c) {
                return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
            }) + '"';
    }

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    function safe(fn) {
        try {
            var v = fn();
            return v == null ? "" : v;
        } catch (e) {
            return "";
        }
    }
})();
