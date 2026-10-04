# Standalone Markdown PDF CLI Usage Guide

This document provides a comprehensive operational guide for the standalone **Markdown PDF CLI**.

---

## Table of Contents

1. [Introduction & Architecture](#1-introduction--architecture)
2. [Installation & Setup](#2-installation--setup)
3. [Command Syntax & Options](#3-command-syntax--options)
4. [Configuration System & Precedence](#4-configuration-system--precedence)
5. [Rich Content & Diagram Rendering](#5-rich-content--diagram-rendering)
6. [CI/CD & Headless Pipeline Integration](#6-cicd--headless-pipeline-integration)
7. [Troubleshooting & Diagnostics](#7-troubleshooting--diagnostics)
8. [Credits & Licensing](#8-credits--licensing)

---

## 1. Introduction & Architecture

Markdown PDF CLI is a standalone Node.js tool for compiling Markdown documents into **PDF**, **HTML**, **PNG**, and **JPEG** formats. It uses the same battle-tested engine as the popular VS Code extension by **yzane**, but has been cleanly decoupled from VS Code APIs to allow direct execution from the command line, scripts, and automated CI/CD runners.

```
                      Markdown Source (.md)
                               │
                               ▼
                    [YAML Front Matter Parser]
                               │
                               ▼
                     [Markdown-it Engine]
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         KaTeX Math         Mermaid          PlantUML
       (Inline/Block)     (Hydrated DOM)     (Encoded)
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    [HTML Document Builder]
                  (CSS Styles + Base64 Fonts)
                               │
                               ▼
                  [Puppeteer Headless Engine]
                     (networkidle0 sync)
                               │
        ┌──────────────┬───────┴──────┬──────────────┐
        ▼              ▼              ▼              ▼
     PDF File      HTML File       PNG Image     JPEG Image
```

---

## 2. Installation & Setup

### Local Installation from Source

Clone or download this repository, build the binary, and link it:

```bash
# Install dependencies
npm install

# Build CLI and extension bundles
npm run build

# Install globally to system
npm install -g .

# Or link for instant local development
npm link
```

### Verification

Check that the CLI command is available:

```bash
markdown-pdf --version
# Outputs: 2.2.0

markdown-pdf --help
```

---

## 3. Command Syntax & Options

### General Syntax

```bash
markdown-pdf [options] <files...>
```

### Supported Options

| Option | Flag | Description | Default |
| :--- | :--- | :--- | :--- |
| `--type <types...>` | `-t` | Output formats (`pdf`, `html`, `png`, `jpeg`, `all`). Supports comma-separated or space-separated lists. | `pdf` |
| `--output <path>` | `-o` | Destination file or directory. | Next to source file |
| `--style <paths...>` | `-s` | Paths to additional CSS stylesheets. | None |
| `--format <format>` | | PDF paper format (`A4`, `Letter`, `Legal`, `Tabloid`, `A3`, `A5`, etc.). | `A4` |
| `--landscape` | | Renders PDF in landscape orientation. | `false` (Portrait) |
| `--margin <margin>` | | Uniform margins for all sides (e.g. `15mm`, `1cm`, `0.5in`). | `1cm` |
| `--margin-top <margin>` | | Top page margin. | `1cm` |
| `--margin-bottom <margin>` | | Bottom page margin. | `1cm` |
| `--margin-left <margin>` | | Left page margin. | `1cm` |
| `--margin-right <margin>` | | Right page margin. | `1cm` |
| `--highlight-style <name>` | | Syntax highlight theme name (e.g. `github.css`, `monokai.css`). | `github.css` |
| `--no-highlight` | | Disables code block syntax highlighting. | Syntax highlight on |
| `--mermaid-server <url>` | | URL to custom Mermaid.js bundle. | unpkg CDN |
| `--plantuml-server <url>` | | URL to PlantUML rendering server. | Official PlantUML |
| `--executable-path <path>` | | Path to custom Google Chrome or Chromium executable. | Auto-detected |
| `--no-auto-download` | | Prevents automatic downloading of Chromium. | Download enabled |
| `--config <path>` | `-c` | Path to JSON or YAML configuration file. | None |
| `--debug` | | Retains temporary HTML files and prints detailed stack traces. | `false` |
| `--quiet` | `-q` | Quiet mode: suppresses progress logs, displays errors only. | `false` |
| `--scale <scale>` | | Page rendering scale factor (e.g. `0.9` or `1.2`). | `1` |
| `--width <width>` | | Explicit paper width (e.g. `210mm`). Overrides `--format`. | None |
| `--height <height>` | | Explicit paper height (e.g. `297mm`). Overrides `--format`. | None |
| `--page-ranges <ranges>` | | Specific page ranges to print (e.g. `"1-3, 5"`). | All pages |
| `--sanitize <mode>` | | HTML sanitization mode (`gfm`, `gfm-allow-style`, `none`). | `gfm` |
| `--breaks` | | Converts single line breaks in paragraphs into `<br>`. | `false` |

---

## 4. Configuration System & Precedence

Markdown PDF CLI uses a hierarchical configuration system. Settings defined at higher precedence tiers override lower ones:

1. **CLI Flags**: Passed directly in terminal (e.g. `--format Letter`).
2. **YAML Front Matter**: Defined at the top of the `.md` file.
3. **Configuration File**: External `.json` or `.yaml` file specified via `-c, --config`.
4. **Defaults**: Standard built-in configuration.

### Example: YAML Front Matter in Markdown

```markdown
---
format: Letter
orientation: landscape
margin:
  top: 15mm
  bottom: 15mm
  left: 20mm
  right: 20mm
styles:
  - ./styles/custom.css
highlightStyle: monokai.css
breaks: true
---

# Document Title
```

### Example: External Configuration File

Create `markdown-pdf.json`:

```json
{
  "format": "A4",
  "orientation": "portrait",
  "margin": {
    "top": "2cm",
    "bottom": "2cm",
    "left": "1.5cm",
    "right": "1.5cm"
  },
  "highlight": true,
  "highlightStyle": "github.css",
  "styles": ["./styles/theme.css"],
  "sanitize": "gfm"
}
```

Run with configuration:

```bash
markdown-pdf --config markdown-pdf.json document.md
```

---

## 5. Rich Content & Diagram Rendering

### Mermaid Client-Side Hydration
Mermaid blocks (` ```mermaid ... ``` `) are rendered client-side inside Chromium headless. The CLI automatically coordinates with Puppeteer via `networkidle0` synchronization, ensuring that all diagram SVGs are fully calculated, drawn, and styled before the PDF or image capture is executed.

### KaTeX Mathematics
KaTeX math expressions are fully supported in all standard formats:
- `$inline$`
- `$$block$$`
- `\(inline\)` and `\[block\]`
- ` ```math ` code fences

Offline rendering is ensured by automatically bundling KaTeX CSS and base64-encoded WOFF2 font glyphs directly into the generated document.

### PlantUML Diagrams
Both `@startuml ... @enduml` and ` ```plantuml ... ``` ` blocks are compressed using Deflate + 64-char encoding and fetched from the configured PlantUML server as high-resolution SVGs.

### Transclusion / Includes
Include external Markdown files using the include syntax:
```markdown
:[Section Name](relative/path/to/section.md)
```

---

## 6. CI/CD & Headless Pipeline Integration

Because Markdown PDF CLI operates without a display server (using headless Chromium), it integrates seamlessly into automated CI/CD pipelines.

### GitHub Actions Workflow Example

Create `.github/workflows/generate-docs.yml`:

```yaml
name: Generate PDF Documentation

on:
  push:
    branches: [main]

jobs:
  build-pdf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies & Build
        run: |
          npm ci
          npm run build
          npm link

      - name: Convert Markdown to PDF
        run: |
          markdown-pdf --quiet -t pdf -o ./dist/ docs/*.md

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: pdf-documentation
          path: ./dist/*.pdf
```

---

## 7. Troubleshooting & Diagnostics

- **Chromium Not Found**:
  By default, Markdown PDF searches for installed Google Chrome, Microsoft Edge, or Chromium. If none is installed, it downloads Chromium to `~/.markdown-pdf/chromium/`. If in a restricted environment, specify `--executable-path /path/to/chrome`.
- **Debugging Render Issues**:
  Use `--debug` to keep the intermediate `_tmp.html` document intact and examine console logs:
  ```bash
  markdown-pdf --debug document.md
  ```
- **Quiet Execution**:
  Use `-q` or `--quiet` to suppress progress outputs when embedding in shell scripts.

---

## 8. Credits & Licensing

This project is directly derived from and inspired by the exceptional work of **[yzane](https://github.com/yzane)** on [vscode-markdown-pdf](https://github.com/yzane/vscode-markdown-pdf).

- Original Author: **yzane**
- License: **MIT License** (see [LICENSE.txt](../LICENSE.txt))
