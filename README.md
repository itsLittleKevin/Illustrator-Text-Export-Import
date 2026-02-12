# Illustrator Text Export/Import — Localization Scripts

> MIT-licensed tools for exporting Illustrator text frames to translator-friendly XML and re-importing with full style preservation.

## Features

- **Style preservation**: Exports and re-imports fonts, sizes, bold/italic/underline, and colors per line
- **Color support**: Handles RGB, CMYK, Grayscale, and Spot colors
- **Paragraph styles**: Tab stops, horizontal/vertical alignment
- **Translator-friendly**: `[NEWLINE]` and `[TAB]` markers, frame metadata, character estimates
- **Modern UI**: ScriptUI folder picker with editable path field
- **Error handling**: Clear alerts for missing fonts or invalid XML

---

## What Changed (Original → Modified)

### Export Script (`AI-Export-Text.jsx`)

| Feature | Original | Modified |
|---|---|---|
| **Text format** | Raw text with `\r` / `\t` | Plain text with `[NEWLINE]` and `[TAB]` markers |
| **Styles** | None | Per-line styles in `<LINE_STYLES>` (font, size, bold, italic, underline, color) |
| **Color support** | None | RGB, CMYK, Grayscale, and Spot colors |
| **Paragraph styles** | None | Tab stops, horizontal/vertical alignment in `<PARA_STYLE>` |
| **Metadata** | None | `<METADATA>` block with export date, AI version, document name |
| **Frame info** | None | `<FRAME_INFO>` with frame dimensions, estimated max characters, tab stop positions |

### Import Script (`AI-Import-Text.jsx`)

| Feature | Original | Modified |
|---|---|---|
| **Style restoration** | None — text imported without styling | Full per-line style restoration from `<LINE_STYLES>` |
| **Color restoration** | None — all text inherits one color | Per-line color applied (RGB, CMYK, Gray, Spot) |
| **Paragraph styles** | None | Tab stops and alignment restored from `<PARA_STYLE>` |
| **Backward compatibility** | N/A | Detects old format (no `<LINE_STYLES>`) and falls back to plain text import |

---

## Translator Guide: Working with the XML

### XML Structure

Each text frame produces an `<ITEM>` block:

```xml
<ITEM id='1'>
  <FRAME_INFO>
    <NAME>TextFrame_1</NAME>
    <LAYER>Text</LAYER>
    <FRAME_WIDTH>42.27</FRAME_WIDTH>        <!-- frame width in points -->
    <FRAME_HEIGHT>-21.91</FRAME_HEIGHT>      <!-- frame height in points -->
    <ESTIMATED_MAX_CHARS>7</ESTIMATED_MAX_CHARS>  <!-- rough character limit per line -->
    <TAB_STOPS>100</TAB_STOPS>               <!-- tab positions (if any) -->
  </FRAME_INFO>
  <TEXT><![CDATA[Page[NEWLINE]Up]]></TEXT>
  <LINE_STYLES><![CDATA[size:9.00;color:0,0,0;font:Arial-BoldMT
size:9.00;color:0,0,0;font:Arial-BoldMT]]></LINE_STYLES>
  <PARA_STYLE>tabstops:100;halign:left</PARA_STYLE>
</ITEM>
```

### What to Translate

- **`<TEXT>`** — Translate the text content inside `<![CDATA[...]]>`.
- **Do NOT modify** `<FRAME_INFO>`, `<LINE_STYLES>` style values, or `<PARA_STYLE>` unless adjusting line count.

### Placeholder Rules

| Marker | Meaning | Rule |
|---|---|---|
| `[NEWLINE]` | Line break | **Add or remove** based on whether the translation fits on one line |
| `[TAB]` | Tab character | **Always keep** — these align to fixed tab stops in the layout |

### Using `FRAME_INFO` Hints

- **`FRAME_WIDTH`** — The width of the text box in points. If your translation is much longer than the original, it may overflow.
- **`ESTIMATED_MAX_CHARS`** — A rough estimate of how many **Latin** characters fit per line (based on `font_size × 0.6`). For other scripts, adjust the estimate using the multipliers below:

  | Script | Multiplier | Example (`ESTIMATED_MAX_CHARS` = 10) |
  |---|---|---|
  | Latin (English, French, etc.) | × 1.0 | ~10 characters |
  | CJK (Chinese, Japanese, Korean) | × 0.6 | ~6 characters |
  | Thai / Devanagari | × 0.7 | ~7 characters |
  | Arabic / Hebrew | × 0.8 | ~8 characters |

  > **Quick formula:** `your_limit ≈ ESTIMATED_MAX_CHARS × multiplier` (round down).  
  > These are rough guides — always preview in Illustrator to confirm fit.

- **`TAB_STOPS`** — Tab positions in points. Text after `[TAB]` will snap to these positions. Don't remove `[TAB]` markers.

### Adjusting Line Breaks

If the original English needed two lines but your translation fits on one:

**Before (English — 2 lines):**
```xml
<TEXT><![CDATA[Page[NEWLINE]Up]]></TEXT>
<LINE_STYLES><![CDATA[size:9.00;color:0,0,0;font:Arial-BoldMT
size:9.00;color:0,0,0;font:Arial-BoldMT]]></LINE_STYLES>
```

**After (Chinese — 1 line):**
```xml
<TEXT><![CDATA[上一页]]></TEXT>
<LINE_STYLES><![CDATA[size:9.00;color:0,0,0;font:Arial-BoldMT]]></LINE_STYLES>
```

> **Important:** The number of lines in `<LINE_STYLES>` must match the number of text segments separated by `[NEWLINE]` in `<TEXT>`. If you remove a `[NEWLINE]`, remove the corresponding style line too.

### Color Format Reference

Colors appear in `LINE_STYLES` in one of these formats:

| Format | Color Model | Example |
|---|---|---|
| `color:R,G,B` | RGB (0–255) | `color:0,0,255` (blue) |
| `cmykcolor:C,M,Y,K` | CMYK (0–100) | `cmykcolor:100.00,0.00,0.00,0.00` (cyan) |
| `graycolor:G` | Grayscale (0–100) | `graycolor:0.00` (black) |
| `spotcolor:name,tint` | Spot color | `spotcolor:PANTONE 286 C,100.00` |

You generally don't need to change colors — just keep them as-is for each line.

### Style Keys Reference

Each line in `LINE_STYLES` is a semicolon-separated list:

| Key | Meaning | Example |
|---|---|---|
| `b` | Bold | `b` |
| `i` | Italic | `i` |
| `u` | Underline | `u` |
| `size:X` | Font size in points | `size:12.00` |
| `color:R,G,B` | RGB fill color | `color:255,0,0` |
| `cmykcolor:C,M,Y,K` | CMYK fill color | `cmykcolor:0,100,100,0` |
| `font:NAME` | Font PostScript name | `font:Arial-BoldMT` |
| `opacity:X` | Transparency (0–1) | `opacity:0.50` |

---

## Folder Structure

```
├── ExportTextFrames.jsx    # Export script with style & color capture
├── ImportTextFrames.jsx    # Import script with style restoration
└── README.md               # This file
```

## Usage

1. Open Adobe Illustrator
2. **File → Scripts → Other Script…** → choose `ExportTextFrames.jsx`
3. Select the folder containing your `.ai` files → exports one `.ai.xml` per file
4. Send XML files to translator
5. Translator edits `<TEXT>` content, adjusts `[NEWLINE]` and `LINE_STYLES` as needed
6. Run `ImportTextFrames.jsx` → select the same folder → styles, colors, and fonts are restored automatically
5. Run `modified/AI-Import-Text.jsx` → Select same folder → Re-imports translated text with styles preserved
