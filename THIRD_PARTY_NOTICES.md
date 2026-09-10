# Third-party notices

## OpenMAIC

The course-document structure and interruption/resume playback flow were informed by OpenMAIC, specifically its scene DSL, playback engine, and PPTX export architecture at commit `29735f10d0081859ac3db1a50a0cc92f46436004`.

Project: https://github.com/THU-MAIC/OpenMAIC

Copyright (c) 2026 THU-MAIC. OpenMAIC is distributed under the MIT License. A copy is included at `licenses/OpenMAIC-LICENSE`.

This project implements its own smaller course model and export code. It does not include OpenMAIC's `mathml2omml` package.

## Export dependencies

- PptxGenJS, MIT License: https://github.com/gitbrent/PptxGenJS
- JSZip, MIT or GPL-3.0-or-later; this project uses it under the MIT option: https://github.com/Stuk/jszip
- PDFKit, MIT License: https://github.com/foliojs/pdfkit
- Noto Sans SC font files, SIL Open Font License 1.1: https://github.com/fontsource/font-files

The corresponding package distributions include their license texts in `node_modules` after installation.
