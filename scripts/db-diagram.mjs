#!/usr/bin/env node
/**
 * Renders db/erd.mmd to db/erd.svg (and a standalone db/erd.html).
 *
 *     npm run db:diagram
 *
 * The committed SVG is the deliverable for course requirement 1.f, so the
 * diagram must be viewable without a network connection or a Mermaid plugin.
 * The .mmd file stays the source of truth: edit it, then re-run this.
 *
 * Rendering needs a browser, which is a heavy dependency for a project that
 * otherwise has none — so it is optional. If it is missing this script says so
 * and exits without failing the build; the committed SVG remains valid.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, ok, fail, info, warn, dim, title } from './lib/env.mjs'

const SOURCE = join(ROOT, 'db', 'erd.mmd')
const SVG_OUT = join(ROOT, 'db', 'erd.svg')
const HTML_OUT = join(ROOT, 'db', 'erd.html')

title('Rendering the database diagram')

if (!existsSync(SOURCE)) {
  fail('db/erd.mmd not found')
  process.exit(1)
}
const diagram = readFileSync(SOURCE, 'utf8')

// The HTML view never needs a build step, so write it first and always.
writeFileSync(
  HTML_OUT,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>YBO Social Network — database diagram</title>
<style>
  body { margin: 0; padding: 2rem; font-family: system-ui, sans-serif; background: #fff; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 1.5rem; }
  .mermaid { display: flex; justify-content: center; }
</style>
</head>
<body>
<h1>YBO Social Network — database schema</h1>
<pre class="mermaid">
${diagram.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}
</pre>
<script type="module">
  import mermaid from 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
</script>
</body>
</html>
`,
  'utf8'
)
ok('db/erd.html written (open it in a browser)')

let chromium
try {
  const require = createRequire(import.meta.url)
  chromium = require('playwright').chromium
} catch {
  warn('playwright is not installed — skipping SVG rendering')
  dim('    The committed db/erd.svg is still valid.')
  dim('    To regenerate it:  npm i -D playwright mermaid && npm run db:diagram')
  process.exit(0)
}

let mermaidPath
try {
  const require = createRequire(import.meta.url)
  // The UMD build attaches window.mermaid; the .mjs build does not, and a
  // module script tag cannot export into the page scope.
  mermaidPath = require.resolve('mermaid/dist/mermaid.min.js')
} catch {
  warn('the mermaid package is not installed — skipping SVG rendering')
  process.exit(0)
}

info('rendering with a headless browser ...')
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body><div id="out"></div></body></html>')
  await page.addScriptTag({ path: mermaidPath })
  await page.waitForFunction(() => Boolean(window.mermaid))

  const svg = await page.evaluate(async (src) => {
    const mermaid = window.mermaid
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
    const { svg } = await mermaid.render('erd', src)
    return svg
  }, diagram)

  writeFileSync(SVG_OUT, svg, 'utf8')
  ok(`db/erd.svg written (${Math.round(svg.length / 1024)} KB)`)
} finally {
  await browser.close()
}
