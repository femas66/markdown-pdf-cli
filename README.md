# Markdown PDF CLI

<p align="center">
  <b>A powerful, standalone Command Line Tool to convert Markdown into polished PDFs, HTML, PNG, and JPEG images.</b><br>
  Engineered for developers, technical writers, and automated CI/CD pipelines — no VS Code window required.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node Version">
  <img src="https://img.shields.io/badge/version-2.2.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg" alt="Platforms">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

<p align="center">
  <a href="#about--origin">About & Origin</a> •
  <a href="#key-highlights">Highlights</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#header--footer-customization">Header & Footer</a> •
  <a href="#cli-options-reference">CLI Reference</a> •
  <a href="#configuration--front-matter">Configuration</a> •
  <a href="#panduan-bahasa-indonesia">Panduan Bahasa Indonesia</a> •
  <a href="#credits--acknowledgments">Credits</a>
</p>

---

## About & Origin

> [!NOTE]
> **Lineage & Attribution**: This project is the standalone Command Line Interface (CLI) edition of the beloved VS Code extension [vscode-markdown-pdf](https://github.com/yzane/vscode-markdown-pdf), originally created and maintained by **[yzane](https://github.com/yzane)**.
>
> While the original extension requires Visual Studio Code to be installed and active, **`markdown-pdf-cli`** decouples the proven Markdown-it and Puppeteer rendering pipeline into an independent Node.js executable. The original extension documentation has been preserved in [README.vscode.md](README.vscode.md).

---

## Key Highlights

- **Headless & Standalone**: Runs anywhere Node.js (>= 18) is installed. Ideal for servers, Docker containers, and GitHub Actions / GitLab CI workflows.
- **Flawless Mermaid Rendering**: Flowcharts, sequence diagrams, class models, state machines, ER diagrams, Gantt charts, git graphs, and pie charts are fully hydrated into crisp vector SVGs inside Chromium before exporting.
- **Offline KaTeX Math**: Beautiful mathematical formulas via KaTeX ($inline$, $$display$$, `\(...\)` / `\[...\]`, and <code>```math</code> code fences) with self-contained, base64-inlined fonts.
- **PlantUML Integration**: Supports both delimiter syntax (`@startuml ... @enduml`) and fenced blocks (<code>```plantuml</code>).
- **Rich Syntax Highlighting**: Code blocks are formatted with Highlight.js, offering dozens of built-in themes (`github.css`, `monokai.css`, `vs.css`, etc.).
- **Multi-Format Output**: Export to `.pdf`, `.html`, `.png`, and `.jpeg` individually or all at once with `-t all`.
- **Granular Page Controls**: Customize paper sizes (A4, Letter, Legal, etc.), orientation, margins, and header/footer templates.
- **Smart Chromium Resolver**: Automatically finds Google Chrome, Microsoft Edge, or Brave already installed on your system. If none is available, it seamlessly downloads a lightweight portable Chromium build to your user cache directory (`~/.markdown-pdf/chromium/`).

---

## Installation

### Prerequisites
- **Node.js**: version `18.0.0` or higher
- **npm**: version `9.0.0` or higher

---

### Option 1: Global Installation from GitHub (Recommended)

You can install `markdown-pdf-cli` globally across your system directly from GitHub:

```bash
npm install -g git+https://github.com/femas66/markdown-pdf-cli.git
```

Verify that the binary is available in your PATH:

```bash
markdown-pdf --version
# Output: 2.2.0

markdown-pdf --help
```

---

### Option 2: Clone and Install Locally

If you prefer building from source or contributing to the project:

```bash
# 1. Clone this repository
git clone https://github.com/femas66/markdown-pdf-cli.git
cd markdown-pdf-cli

# 2. Install dependencies and compile the executable
npm install
npm run build

# 3. Link globally to your local environment
npm install -g .
# (or use: npm link)
```

---

### Option 3: Run Directly Without Global Installation

If you only need to run the tool without altering global npm packages:

```bash
# From inside the cloned project directory:
node dist/cli.js path/to/document.md

# Or via npx:
npx . path/to/document.md
```

---

## Quick Start

### 1. Basic PDF Export
By default, the tool converts your markdown file into a PDF placed in the same folder:
```bash
markdown-pdf document.md
# ✔ Converted document.md -> document.pdf
```

### 2. Export All Formats Simultaneously
Generate PDF, HTML, PNG, and JPEG outputs in a single pass:
```bash
markdown-pdf -t all document.md
```

Or pick specific formats:
```bash
markdown-pdf -t pdf,html document.md
```

### 3. Batch Processing with Destination Folder
Convert multiple files matching a glob pattern and direct the output into a specific directory:
```bash
markdown-pdf -t pdf -o ./output/ docs/*.md
```

### 4. Custom CSS & Landscape Orientation
Inject your own stylesheet and print horizontally:
```bash
markdown-pdf -s ./branding.css --landscape document.md
```

### 5. Paper Format & Custom Margins
```bash
# Standard US Letter with uniform 15mm margins
markdown-pdf --format Letter --margin 15mm document.md

# A4 with custom individual margins
markdown-pdf --format A4 --margin-top 20mm --margin-bottom 20mm --margin-left 15mm --margin-right 15mm document.md
```

---

## Header & Footer Customization

A common need when printing reports and whitepapers is adjusting or removing running headers and footers. You can customize them via **CLI flags** or through **YAML Front Matter** in your Markdown document.

### Scenario A: Clean Header (No Text) & Page Numbers Only in Footer

If you want the top of each page completely clear, while displaying centered page numbers at the bottom:

**Via CLI Flags:**
```bash
markdown-pdf -t pdf \
  --header-template '<span></span>' \
  --footer-template '<div style="font-size: 9pt; width: 100%; text-align: center; color: #555;"><span class="pageNumber"></span></div>' \
  document.md
```

**Via YAML Front Matter:**
```yaml
---
markdown-pdf:
  displayHeaderFooter: true
  headerTemplate: '<span></span>'
  footerTemplate: '<div style="font-size: 9pt; width: 100%; text-align: center; color: #555;"><span class="pageNumber"></span></div>'
---
```

> **Template Placeholders Available:**
> - `<span class="pageNumber"></span>`: Current page number
> - `<span class="totalPages"></span>`: Total page count
> - `<span class="title"></span>`: Document title
> - `<span class="date"></span>`: Print date

---

### Scenario B: Completely Disable Headers and Footers

For a completely borderless, edge-to-edge layout without any automatic header or footer text:

**Via CLI Flag:**
```bash
markdown-pdf -t pdf --no-header-footer document.md
```

**Via YAML Front Matter:**
```yaml
---
markdown-pdf:
  displayHeaderFooter: false
---
```

---

## CLI Options Reference

| Option | Shorthand | Type / Values | Default | Description |
| :--- | :---: | :--- | :--- | :--- |
| `--version` | `-v` | Flag | | Print the current version. |
| `--help` | `-h` | Flag | | Display detailed help information. |
| `--type <types...>` | `-t` | `pdf`, `html`, `png`, `jpeg`, `all` | `pdf` | Output format(s). Accepts comma or space-separated lists. |
| `--output <path>` | `-o` | File or Directory | `[source-dir]` | Destination output file path or directory for batch exports. |
| `--style <paths...>` | `-s` | Path to `.css` files | `[]` | One or more custom CSS stylesheets to inject. |
| `--format <format>` | | `A4`, `Letter`, `Legal`, `Tabloid`, `A3` | `A4` | Paper format. |
| `--landscape` | | Flag | `false` | Set page orientation to landscape. |
| `--margin <margin>` | | CSS length (e.g. `15mm`, `1in`) | | Set uniform margins on all four sides. |
| `--margin-top` | | CSS length | `1.5cm` | Top margin. |
| `--margin-bottom` | | CSS length | `1cm` | Bottom margin. |
| `--margin-left` | | CSS length | `1cm` | Left margin. |
| `--margin-right` | | CSS length | `1cm` | Right margin. |
| `--no-header-footer` | | Flag | `false` | Disable running header and footer completely. |
| `--header-template` | | HTML string | Title & Date | Custom HTML header template (`<span></span>` for blank). |
| `--footer-template` | | HTML string | Page number | Custom HTML footer template. |
| `--highlight-style` | | Theme name (e.g. `github.css`, `monokai.css`)| `github.css` | Syntax highlighting theme for code blocks. |
| `--no-highlight` | | Flag | `false` | Disable code syntax highlighting. |
| `--mermaid-server` | | URL string | unpkg CDN | URL for the `mermaid.min.js` runtime script. |
| `--plantuml-server` | | URL string | PlantUML official | Server URL used to compile PlantUML diagrams. |
| `--executable-path` | | Executable path | Auto-detect | Custom path to local Chrome, Chromium, or Edge binary. |
| `--no-auto-download` | | Flag | `false` | Prevent downloading portable Chromium if no local browser is found. |
| `--config <path>` | `-c` | Path to JSON/YAML | | Load configuration options from an external file. |
| `--scale <scale>` | | Decimal (`0.1` - `2.0`) | `1` | Page rendering zoom factor. |
| `--page-ranges` | | Range string (e.g. `"1-3, 5"`) | All | Specific pages to export to PDF. |
| `--sanitize <mode>` | | `gfm`, `gfm-allow-style`, `none` | `gfm` | HTML sanitization mode for embedded markup. |
| `--breaks` | | Flag | `false` | Convert soft line breaks in Markdown to `<br>`. |
| `--debug` | | Flag | `false` | Keep temporary HTML files and output diagnostic logs. |
| `--quiet` | `-q` | Flag | `false` | Silence non-error terminal logs. |

---

## Configuration & Front Matter

`markdown-pdf-cli` resolves options through a predictable 4-tier hierarchy:

```
[1. Built-in Defaults]
          ↓
[2. External Config File (--config)]
          ↓
[3. Document YAML Front Matter]
          ↓
[4. CLI Command Line Flags] (Highest Priority)
```

### External Config File (`markdown-pdf.json`)

You can keep project-wide defaults in a `markdown-pdf.json` file:

```json
{
  "format": "Letter",
  "orientation": "portrait",
  "highlightStyle": "github.css",
  "margin": {
    "top": "15mm",
    "bottom": "15mm",
    "left": "10mm",
    "right": "10mm"
  }
}
```

Apply it using the `-c` flag:
```bash
markdown-pdf -c markdown-pdf.json docs/spec.md
```

---

## Panduan Bahasa Indonesia

### Sekilas tentang Projek Ini
`markdown-pdf-cli` adalah versi **Command Line Interface (CLI)** mandiri yang dikembangkan dari ekstensi VS Code populer [vscode-markdown-pdf](https://github.com/yzane/vscode-markdown-pdf) karya **[yzane](https://github.com/yzane)**. Versi ini dirancang untuk memudahkan konversi berkas Markdown ke PDF, HTML, dan gambar langsung dari terminal atau server tanpa membutuhkan instalasi aplikasi VS Code.

### Ringkasan Perintah:
```bash
# 1. Konversi standar ke PDF
markdown-pdf berkas.md

# 2. Ekspor ke semua format (PDF, HTML, PNG, JPEG)
markdown-pdf -t all berkas.md

# 3. Menghilangkan header dan hanya menampilkan nomor halaman di footer
markdown-pdf -t pdf \
  --header-template '<span></span>' \
  --footer-template '<div style="text-align: center;"><span class="pageNumber"></span></div>' \
  berkas.md

# 4. Menghilangkan header dan footer sama sekali
markdown-pdf -t pdf --no-header-footer berkas.md
```

---

## Credits & Acknowledgments

### Original Author & Ecosystem
This CLI tool stands on the shoulders of the original **vscode-markdown-pdf** extension:
- **Original Author**: **[yzane](https://github.com/yzane)**
- **Original Repository**: [https://github.com/yzane/vscode-markdown-pdf](https://github.com/yzane/vscode-markdown-pdf)
- **Sponsorship**: If this workflow saves you time, please consider supporting the original author: [GitHub Sponsors: yzane](https://github.com/sponsors/yzane).

### Open Source Libraries
We would like to express our gratitude to the open-source community behind these essential libraries:
- [Puppeteer](https://github.com/puppeteer/puppeteer) — Headless Chrome automation
- [markdown-it](https://github.com/markdown-it/markdown-it) — Fast Markdown parser
- [Mermaid.js](https://github.com/mermaid-js/mermaid) — Diagramming and charting engine
- [KaTeX](https://github.com/KaTeX/KaTeX) — High-performance math typesetting
- [PlantUML](https://plantuml.com/) — PlantUML compilation
- [highlight.js](https://github.com/highlightjs/highlight.js) — Syntax highlighting
- [Commander.js](https://github.com/tj/commander.js) — Command-line interface framework

---

## License

This project is open-source software licensed under the **[MIT License](LICENSE.txt)**.  
The original VS Code extension documentation is archived in [README.vscode.md](README.vscode.md).
