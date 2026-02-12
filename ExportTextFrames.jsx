/*
 * ExportTextFrames.jsx
 * Illustrator ExtendScript — batch-export text frames to translator-friendly XML
 *
 * Copyright (c) 2026 Kevin / Middlebury College
 * MIT License — free to use, modify, and distribute.
 *
 * This script was written from scratch for localization workflows.
 */

// ───────────────────────── Entry Point ─────────────────────────

(function main() {
	var sourceDir = chooseFolder("Export — Choose folder containing .ai files");
	if (!sourceDir) return;

	var aiFiles = sourceDir.getFiles("*.ai");
	if (aiFiles.length === 0) { alert("No .ai files found in the selected folder."); return; }

	var processed = 0;
	for (var f = 0; f < aiFiles.length; f++) {
		var document = app.open(aiFiles[f]);
		if (writeXML(document)) processed++;
		document.close(SaveOptions.DONOTSAVECHANGES);
	}
	alert("Export complete — " + processed + " of " + aiFiles.length + " files exported.");
})();

// ───────────────────────── Folder Picker (ScriptUI) ─────────────────────────

function chooseFolder(title) {
	var dlg = new Window("dialog", title || "Choose Folder");
	dlg.orientation = "column";
	dlg.alignChildren = ["fill", "top"];

	dlg.add("statictext", undefined, "Paste a folder path or click Browse:");

	var row = dlg.add("group");
	row.alignChildren = ["fill", "center"];
	row.alignment = ["fill", "top"];
	var pathField = row.add("edittext", undefined, Folder.desktop.fsName);
	pathField.characters = 55;
	var browseBtn = row.add("button", undefined, "Browse\u2026");
	browseBtn.preferredSize = [80, 26];
	browseBtn.onClick = function () {
		var picked = Folder.selectDialog("Select folder");
		if (picked) pathField.text = picked.fsName;
	};

	var btnRow = dlg.add("group");
	btnRow.alignment = ["right", "top"];
	btnRow.add("button", undefined, "Cancel", { name: "cancel" });
	btnRow.add("button", undefined, "OK", { name: "ok" });

	if (dlg.show() !== 1) return null;

	var target = new Folder(pathField.text);
	if (!target.exists) {
		alert("Folder not found:\n" + pathField.text);
		return null;
	}
	return target;
}

// ───────────────────────── XML Writer ─────────────────────────

function writeXML(document) {
	var xmlPath = new File(document.path + "/" + document.name + ".xml");
	if (xmlPath.exists) {
		if (!confirm("Overwrite existing XML for \"" + document.name + "\"?")) return false;
	}

	var frames = document.textFrames;
	if (frames.length === 0) return false;

	xmlPath.encoding = "UTF8";
	xmlPath.lineFeed = "windows";
	xmlPath.open("w");
	xmlPath.write("\uFEFF"); // UTF-8 BOM

	emit(xmlPath, "<?xml version='1.0' encoding='UTF-8'?><ROOT>");
	emitMetadata(xmlPath, document);

	for (var idx = 0; idx < frames.length; idx++) {
		emitItem(xmlPath, frames[idx], idx);
	}

	emit(xmlPath, "</ROOT>");
	xmlPath.close();
	return true;
}

function emitMetadata(out, document) {
	emit(out, "  <METADATA>");
	emit(out, "    <ILLUSTRATOR_VERSION>" + app.version + "</ILLUSTRATOR_VERSION>");
	emit(out, "    <EXPORT_DATE>" + new Date().toString() + "</EXPORT_DATE>");
	emit(out, "    <DOCUMENT_NAME>" + document.name + "</DOCUMENT_NAME>");
	emit(out, "    <TRANSLATION_GUIDE>Preserve [TAB] and [NEWLINE] placeholders in translated text. Check FRAME_INFO for layout constraints and character limits.</TRANSLATION_GUIDE>");
	emit(out, "  </METADATA>");
}

function emitItem(out, frame, index) {
	var id = index + 1;
	emit(out, "  <ITEM id='" + id + "'>");

	// ── Frame info for translators ──
	emitFrameInfo(out, frame, id);

	// ── Plain text with markers ──
	out.write("    <TEXT><![CDATA[");
	out.write(extractText(frame));
	emit(out, "]]></TEXT>");

	// ── Per-paragraph styles ──
	out.write("    <LINE_STYLES><![CDATA[");
	out.write(extractLineStyles(frame));
	emit(out, "]]></LINE_STYLES>");

	// ── Document-level paragraph & frame styles ──
	var combined = collectParaStyles(frame).concat(collectFrameStyles(frame));
	if (combined.length > 0) {
		emit(out, "    <PARA_STYLE>" + combined.join(";") + "</PARA_STYLE>");
	}

	emit(out, "  </ITEM>");
}

// ───────────────────────── Frame Info ─────────────────────────

function emitFrameInfo(out, frame, id) {
	emit(out, "    <FRAME_INFO>");
	emit(out, "      <NAME>" + (frame.name || "TextFrame_" + id) + "</NAME>");
	emit(out, "      <LAYER>" + frame.layer.name + "</LAYER>");

	try {
		var b = frame.geometricBounds; // [left, top, right, bottom]
		var w = roundTo(b[2] - b[0], 2);
		var h = roundTo(b[3] - b[1], 2);
		emit(out, "      <FRAME_WIDTH>" + w + "</FRAME_WIDTH>");
		emit(out, "      <FRAME_HEIGHT>" + h + "</FRAME_HEIGHT>");

		// Estimate Latin character capacity
		var lead = frame.characters[0];
		if (lead && lead.size) {
			var estWidth = lead.size * 0.6;
			emit(out, "      <ESTIMATED_MAX_CHARS>" + Math.floor(w / estWidth) + "</ESTIMATED_MAX_CHARS>");
		}

		// Tab stop positions (from first paragraph)
		emitTabInfo(out, frame);
	} catch (_) { /* layout info unavailable */ }

	emit(out, "    </FRAME_INFO>");
}

function emitTabInfo(out, frame) {
	try {
		var firstPara = frame.paragraphs[0];
		if (!firstPara || !firstPara.tabStops || firstPara.tabStops.length === 0) return;
		var positions = [];
		for (var t = 0; t < firstPara.tabStops.length; t++) {
			positions.push(roundTo(firstPara.tabStops[t].position, 2));
		}
		emit(out, "      <TAB_STOPS>" + positions.join(",") + "</TAB_STOPS>");
		emit(out, "      <TRANSLATION_NOTES>Tab stops at positions: " + positions.join(", ") + " points. Keep [TAB] placeholders in translated text to maintain layout.</TRANSLATION_NOTES>");
	} catch (_) {}
}

// ───────────────────────── Text Extraction ─────────────────────────

function extractText(frame) {
	var paras = frame.paragraphs;
	var output = "";
	for (var p = 0; p < paras.length; p++) {
		if (p > 0) output += "[NEWLINE]";
		var paragraph = paras[p];
		for (var c = 0; c < paragraph.characters.length; c++) {
			var glyph = paragraph.characters[c].contents;
			var code = glyph.charCodeAt(0);

			// Skip line-ending returns (already represented by [NEWLINE])
			if (glyph === "\r" || glyph === "\n") continue;
			// Skip non-printable control codes
			if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) continue;

			output += (glyph === "\t") ? "[TAB]" : glyph;
		}
	}
	return output;
}

// ───────────────────────── Style Extraction ─────────────────────────

function extractLineStyles(frame) {
	var paras = frame.paragraphs;
	if (paras.length === 0) return "";

	var result = [];
	var prev = "";

	for (var p = 0; p < paras.length; p++) {
		var paragraph = paras[p];
		var style = "";

		// Use first visible character of the paragraph as style representative
		for (var c = 0; c < paragraph.characters.length; c++) {
			var ch = paragraph.characters[c].contents;
			if (ch !== "\r" && ch !== "\n") {
				style = describeCharacter(paragraph.characters[c]).join(";");
				break;
			}
		}

		// Empty paragraphs inherit the previous paragraph's style
		if (style === "" && prev !== "") style = prev;

		result.push(style);
		if (style !== "") prev = style;
	}
	return result.join("\n");
}

// Build a semicolon-joined descriptor for one character
function describeCharacter(ch) {
	var tags = [];
	try {
		// Weight & style
		if (ch.fontStyle) {
			if (ch.fontStyle.indexOf("Bold") !== -1 || ch.fontStyle.indexOf("Black") !== -1) tags.push("b");
			if (ch.fontStyle.indexOf("Italic") !== -1 || ch.fontStyle.indexOf("Oblique") !== -1) tags.push("i");
		}
		if (ch.underline) tags.push("u");

		// Size
		if (ch.size) tags.push("size:" + ch.size.toFixed(2));

		// Fill color — supports all Illustrator color models
		if (ch.fillColor) {
			var fc = ch.fillColor;
			var t = fc.typename;
			if (t === "RGBColor") {
				tags.push("color:" + Math.round(fc.red) + "," + Math.round(fc.green) + "," + Math.round(fc.blue));
			} else if (t === "CMYKColor") {
				tags.push("cmykcolor:" + fc.cyan.toFixed(2) + "," + fc.magenta.toFixed(2) + "," + fc.yellow.toFixed(2) + "," + fc.black.toFixed(2));
			} else if (t === "GrayColor") {
				tags.push("graycolor:" + fc.gray.toFixed(2));
			} else if (t === "SpotColor") {
				var tint = (fc.tint != undefined) ? fc.tint.toFixed(2) : "100.00";
				tags.push("spotcolor:" + fc.spot.name + "," + tint);
			}
		}

		// Opacity
		if (ch.opacity && ch.opacity !== 100) {
			tags.push("opacity:" + (ch.opacity / 100).toFixed(2));
		}

		// Font
		if (ch.textFont && ch.textFont.name) tags.push("font:" + ch.textFont.name);

	} catch (_) {}
	return tags;
}

// ───────────────────────── Paragraph & Frame Styles ─────────────────────────

function collectParaStyles(frame) {
	var tags = [];
	try {
		var p = frame.paragraphs[0];
		if (!p) return tags;

		// Tab stops
		if (p.tabStops && p.tabStops.length > 0) {
			var pos = [];
			for (var i = 0; i < p.tabStops.length; i++) {
				if (p.tabStops[i].position) pos.push(roundTo(p.tabStops[i].position, 2));
			}
			if (pos.length > 0) tags.push("tabstops:" + pos.join(","));
		}

		// Justification
		if (p.justification) {
			var map = {};
			map[Justification.Left] = "left";
			map[Justification.Center] = "center";
			map[Justification.Right] = "right";
			map[Justification.FullJustify] = "justify";
			map[Justification.FullJustifyLastLineLeft] = "justify";
			map[Justification.FullJustifyLastLineRight] = "justify";
			map[Justification.FullJustifyLastLineCenter] = "justify";
			var label = map[p.justification];
			if (label) tags.push("halign:" + label);
		}
	} catch (_) {}
	return tags;
}

function collectFrameStyles(frame) {
	var tags = [];
	try {
		if (frame.verticalAlignment) {
			var map = {};
			map[VerticalAlignment.Top] = "top";
			map[VerticalAlignment.Center] = "center";
			map[VerticalAlignment.Bottom] = "bottom";
			map[VerticalAlignment.Justify] = "justify";
			var label = map[frame.verticalAlignment];
			if (label) tags.push("valign:" + label);
		}
	} catch (_) {}
	return tags;
}

// ───────────────────────── Utilities ─────────────────────────

function emit(file, line) { file.writeln(line); }
function roundTo(val, decimals) { var m = Math.pow(10, decimals); return Math.round(val * m) / m; }
