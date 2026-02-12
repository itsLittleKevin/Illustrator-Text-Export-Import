/*
 * ImportTextFrames.jsx
 * Illustrator ExtendScript — batch-import translated XML back into .ai files
 *
 * Copyright (c) 2026 Kevin / Middlebury College
 * MIT License — free to use, modify, and distribute.
 *
 * This script was written from scratch for localization workflows.
 */

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

// ───────────────────────── Entry Point ─────────────────────────

var inFolder = chooseFolder("Import — Choose folder containing .ai files");
if (inFolder) {
	var allFiles = inFolder.getFiles("*.ai");
	if (allFiles.length === 0) {
		alert("No .ai files found in the selected folder.");
	} else {
		var processed = 0;
		for (var i = 0; i < allFiles.length; i++) {
			var doc = app.open(allFiles[i]);
			importXMLWithStyles(doc);
			doc.close(SaveOptions.SAVECHANGES);
			processed++;
		}
		alert("Import complete — " + processed + " of " + allFiles.length + " files updated.");
	}
}

// ───────────────────────── XML Reader ─────────────────────────

function importXMLWithStyles(doc) {
	try {
		var textRefs = doc.textFrames;
		if (textRefs.length == 0) {
			alert("No text frames found in document.");
			return;
		}

		// Find XML file
		var fileIn = File(doc.path + "/" + doc.name + ".xml");
		if (!fileIn.exists) {
			alert("Error! Can't find a matching XML file: " + fileIn.fullName);
			return;
		}

		// Read entire file content at once
		fileIn.open("r");
		fileIn.encoding = "UTF8";
		var xmlContent = fileIn.read();
		fileIn.close();

		// Simple parsing approach - split by items
		var items = xmlContent.split(/<\/ITEM>/);

		var successCount = 0;
		var itemIndex = 0;
		for (var i = 0; i < items.length; i++) {
			var itemContent = items[i];
			if (itemContent.indexOf('<ITEM') === -1) continue;
			if (itemIndex >= textRefs.length) break;

			// Extract TEXT content (inline regex — proven to work)
			var textMatch = itemContent.match(/<TEXT><!\[CDATA\[([\s\S]*?)\]\]><\/TEXT>/);
			if (!textMatch) { itemIndex++; continue; }

			var rawText = textMatch[1];

			// Check for new format (LINE_STYLES present)
			var lineStylesMatch = itemContent.match(/<LINE_STYLES><!\[CDATA\[([\s\S]*?)\]\]><\/LINE_STYLES>/);
			var paraStyleMatch = itemContent.match(/<PARA_STYLE>([^<]*)<\/PARA_STYLE>/);

			try {
				if (lineStylesMatch) {
					// NEW FORMAT: plain text + line styles + paragraph styles
					var lineStylesStr = lineStylesMatch[1];
					var paraStyleStr = paraStyleMatch ? paraStyleMatch[1] : null;
					applyStyledText(textRefs[itemIndex], rawText, lineStylesStr, paraStyleStr);
				} else {
					// LEGACY FORMAT: plain text only
					var plainText = rawText.replace(/\[TAB\]/g, "\t").replace(/\[NEWLINE\]/g, "\n");
					textRefs[itemIndex].contents = plainText;
				}
				successCount++;
			} catch (e) {
				alert("Error processing item " + (itemIndex + 1) + ": " + e.message);
				// Fallback to plain text
				try {
					var plainText = rawText.replace(/\[TAB\]/g, "\t").replace(/\[NEWLINE\]/g, "\n");
					textRefs[itemIndex].contents = plainText;
				} catch (fallbackError) {
					alert("Critical error: Could not import text at all: " + fallbackError.message);
				}
			}
			itemIndex++;
		}

		alert("Import completed. Successfully imported " + successCount + " text frames out of " + textRefs.length + " available.");

	} catch (e) {
		alert("Fatal error in import: " + e.message);
	}
}

// ───────────────────────── Style-Aware Import ─────────────────────────

function applyStyledText(textRef, rawText, lineStylesStr, paraStyleStr) {
	// Convert markers to actual characters
	var plainText = rawText.replace(/\[TAB\]/g, "\t").replace(/\[NEWLINE\]/g, "\n");

	// Set the text content first
	textRef.contents = plainText;

	// Apply paragraph-level styles (tabstops, alignment)
	if (paraStyleStr) {
		applyParagraphStyles(textRef, paraStyleStr);
	}

	// Apply per-line character styles
	if (lineStylesStr) {
		var lineStyles = lineStylesStr.split("\n");
		var lines = rawText.split("[NEWLINE]");

		// Calculate character positions for each line and apply styles
		var story = textRef.textRange;
		var charPos = 0;

		for (var i = 0; i < lines.length && i < lineStyles.length; i++) {
			// Get actual character count for this line (after marker conversion)
			var lineText = lines[i].replace(/\[TAB\]/g, "\t");
			var lineLen = lineText.length;

			// Apply style to all characters in this line
			if (lineLen > 0 && lineStyles[i]) {
				for (var c = charPos; c < charPos + lineLen && c < story.characters.length; c++) {
					try {
						applyCharStyle(story.characters[c], lineStyles[i]);
					} catch (e) {
						// Skip individual character styling errors
					}
				}
			}

			// Move past this line's text + the newline character
			charPos += lineLen;
			if (i < lines.length - 1) {
				charPos += 1; // account for the \n character
			}
		}
	}
}

// ───────────────────────── Paragraph Style Restoration ─────────────────────────

function applyParagraphStyles(textRef, styleString) {
	try {
		var styles = styleString.split(';');
		var paraCount = textRef.paragraphs.length;

		for (var i = 0; i < styles.length; i++) {
			var style = (styles[i] + '').replace(/^\s+|\s+$/g, '');
			if (!style) continue;

			if (style.indexOf('tabstops:') === 0) {
				var tabPositions = style.substring(9).split(',');
				if (tabPositions.length > 0) {
					var tabStopArray = [];
					for (var k = 0; k < tabPositions.length; k++) {
						tabStopArray.push({
							position: parseFloat(tabPositions[k]),
							alignment: TabStopAlignment.LeftTab
						});
					}
					for (var p = 0; p < paraCount; p++) {
						try {
							textRef.paragraphs[p].paragraphAttributes.tabStops = tabStopArray;
						} catch (e) {}
					}
				}
			} else if (style.indexOf('halign:') === 0) {
				var justification = style.substring(7);
				for (var p = 0; p < paraCount; p++) {
					try {
						var paraAttr = textRef.paragraphs[p].paragraphAttributes;
						switch (justification) {
							case "left": paraAttr.justification = Justification.Left; break;
							case "center": paraAttr.justification = Justification.Center; break;
							case "right": paraAttr.justification = Justification.Right; break;
							case "justify": paraAttr.justification = Justification.FullJustify; break;
						}
					} catch (e) {}
				}
			} else if (style.indexOf('valign:') === 0) {
				var alignment = style.substring(7);
				try {
					switch (alignment) {
						case "top": textRef.verticalAlignment = VerticalAlignment.Top; break;
						case "center": textRef.verticalAlignment = VerticalAlignment.Center; break;
						case "bottom": textRef.verticalAlignment = VerticalAlignment.Bottom; break;
						case "justify": textRef.verticalAlignment = VerticalAlignment.Justify; break;
					}
				} catch (e) {}
			}
		}
	} catch (e) {}
}

// ───────────────────────── Character Style Restoration ─────────────────────────

function applyCharStyle(currentChar, styleString) {
	if (!styleString || typeof styleString !== 'string') return;

	var styles = styleString.split(';');

	for (var i = 0; i < styles.length; i++) {
		var style = (styles[i] + '').replace(/^\s+|\s+$/g, '');
		if (!style) continue;

		try {
			if (style === 'b') {
				var fontName = currentChar.textFont.name;
				if (fontName.indexOf('Bold') === -1) {
					var boldFont = fontName.replace('Regular', 'Bold').replace('Italic', 'Bold Italic');
					if (boldFont !== fontName) {
						currentChar.textFont = textFonts.getByName(boldFont);
					}
				}
			} else if (style === 'i') {
				var fontName = currentChar.textFont.name;
				if (fontName.indexOf('Italic') === -1 && fontName.indexOf('Oblique') === -1) {
					var italicFont = fontName.replace('Regular', 'Italic').replace('Bold', 'Bold Italic');
					if (italicFont !== fontName) {
						currentChar.textFont = textFonts.getByName(italicFont);
					}
				}
			} else if (style === 'u') {
				currentChar.underline = true;
			} else if (style.indexOf('size:') === 0) {
				currentChar.size = parseFloat(style.split(':')[1]);
			} else if (style.indexOf('color:') === 0) {
				var colorStr = style.substring(6);
				var colorParts = colorStr.split(',');
				if (colorParts.length >= 3) {
					var newColor = new RGBColor();
					newColor.red = parseFloat(colorParts[0]);
					newColor.green = parseFloat(colorParts[1]);
					newColor.blue = parseFloat(colorParts[2]);
					currentChar.fillColor = newColor;
				}
			} else if (style.indexOf('cmykcolor:') === 0) {
				var colorStr = style.substring(10);
				var colorParts = colorStr.split(',');
				if (colorParts.length >= 4) {
					var newColor = new CMYKColor();
					newColor.cyan = parseFloat(colorParts[0]);
					newColor.magenta = parseFloat(colorParts[1]);
					newColor.yellow = parseFloat(colorParts[2]);
					newColor.black = parseFloat(colorParts[3]);
					currentChar.fillColor = newColor;
				}
			} else if (style.indexOf('graycolor:') === 0) {
				var grayVal = parseFloat(style.substring(10));
				var newColor = new GrayColor();
				newColor.gray = grayVal;
				currentChar.fillColor = newColor;
			} else if (style.indexOf('spotcolor:') === 0) {
				var spotStr = style.substring(10);
				var commaIdx = spotStr.lastIndexOf(',');
				if (commaIdx > 0) {
					var spotName = spotStr.substring(0, commaIdx);
					var tint = parseFloat(spotStr.substring(commaIdx + 1));
					try {
						var spot = app.activeDocument.spots.getByName(spotName);
						var newColor = new SpotColor();
						newColor.spot = spot;
						newColor.tint = tint;
						currentChar.fillColor = newColor;
					} catch (e) { /* spot color not found in document */ }
				}
			} else if (style.indexOf('opacity:') === 0) {
				var opacityVal = parseFloat(style.substring(8));
				currentChar.opacity = opacityVal * 100;
			} else if (style.indexOf('font:') === 0) {
				var fontName = style.split(':')[1];
				currentChar.textFont = textFonts.getByName(fontName);
			}
		} catch (e) {
			// Skip individual style application errors
		}
	}
}
