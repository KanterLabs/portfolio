#!/usr/bin/env node
/**
 * Capture review screenshots of the built site.
 *
 * These are *review artifacts* for humans and agents to look at — they are not
 * committed baselines, and nothing here asserts. Visual regressions are caught
 * by targeted assertions in `tests/`, not by diffing these images.
 *
 * Usage:
 *   node scripts/ui-screenshots.mjs --out .ui-iterate/round-1
 *   node scripts/ui-screenshots.mjs --out /tmp/shots --routes /,/projects/hostlet \
 *     --viewports desktop,mobile --themes dark,light --skip-build
 *
 * Flags:
 *   --out <dir>         output directory (created; existing PNGs are cleared)
 *   --routes <list>     comma-separated paths (default: every page except /greenlit)
 *   --viewports <list>  desktop | mobile (default: both)
 *   --themes <list>     dark | light (default: both)
 *   --port <n>          preview port (default: 4331, probes upward if taken)
 *   --skip-build        reuse the existing dist/ instead of rebuilding
 *   --fold-only         capture just the first viewport height, not the full page
 *   --scale <n>         device pixel ratio (default: 1; use 2 for detail work)
 *   --segment <px>      also slice tall pages into legible <px>-tall sections
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_ROUTES = [
  '/',
  '/projects/hostlet',
  '/projects/kanterlabs-homelab',
  '/projects/multi-node-portfolio',
  '/projects/data-center-operations',
  '/404',
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1100, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

const THEME_STORAGE_KEY = 'portfolio-theme';

function parseArgs(argv) {
  const opts = {
    out: '.ui-iterate/latest',
    routes: DEFAULT_ROUTES,
    viewports: ['desktop', 'mobile'],
    themes: ['dark', 'light'],
    port: 4331,
    skipBuild: false,
    foldOnly: false,
    scale: 1,
    segment: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${arg} requires a value`);
      i += 1;
      return next;
    };
    const list = () =>
      value()
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (arg === '--out') opts.out = value();
    else if (arg === '--routes') opts.routes = list();
    else if (arg === '--viewports') opts.viewports = list();
    else if (arg === '--themes') opts.themes = list();
    else if (arg === '--port') opts.port = Number(value());
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--fold-only') opts.foldOnly = true;
    else if (arg === '--scale') opts.scale = Number(value());
    else if (arg === '--segment') opts.segment = Number(value());
    else throw new Error(`Unknown flag: ${arg}`);
  }

  for (const viewport of opts.viewports) {
    if (!VIEWPORTS[viewport]) throw new Error(`Unknown viewport: ${viewport}`);
  }
  for (const theme of opts.themes) {
    if (theme !== 'dark' && theme !== 'light') throw new Error(`Unknown theme: ${theme}`);
  }

  return opts;
}

function run(command, commandArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: SITE_ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function serverResponds(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Start `astro preview`, or reuse an already-healthy server on the port. */
async function startPreview(startPort) {
  for (let port = startPort; port < startPort + 10; port += 1) {
    if (await serverResponds(port)) {
      console.log(`[screenshots] reusing existing server on :${port}`);
      return { baseURL: `http://127.0.0.1:${port}`, stop: async () => {} };
    }

    // Detached so the whole process group can be killed: `astro preview` runs
    // behind a launcher, and signalling only the direct child leaves the real
    // server holding the port and this script's stdio pipes open forever.
    const child = spawn(
      path.join(SITE_ROOT, 'node_modules/.bin/astro'),
      ['preview', '--host', '127.0.0.1', '--port', String(port)],
      {
        cwd: SITE_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: { ...process.env, PLAYWRIGHT: 'true' },
      },
    );

    let log = '';
    child.stdout.on('data', (chunk) => {
      log += chunk;
    });
    child.stderr.on('data', (chunk) => {
      log += chunk;
    });

    const exited = new Promise((resolve) => child.on('exit', resolve));
    const terminate = async () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      await exited;
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (await serverResponds(port)) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (ready) {
      console.log(`[screenshots] preview server on :${port}`);
      return { baseURL: `http://127.0.0.1:${port}`, stop: terminate };
    }

    await terminate();
    console.warn(`[screenshots] port ${port} unusable, trying next\n${log.slice(-400)}`);
  }

  throw new Error(`Could not start a preview server on ports ${startPort}-${startPort + 9}`);
}

function routeSlug(route) {
  if (route === '/') return 'home';
  return route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-') || 'home';
}

/**
 * Settle the page for a deterministic capture: reveal every scroll-triggered
 * section, finish web fonts, and freeze animations so a full-page shot is not
 * a photo of a transition mid-flight.
 */
async function settle(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('.observe-animate').forEach((section) => {
      section.classList.add('visible');
    });
    document.documentElement.classList.remove('no-js');
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }`,
  });
  await page.waitForTimeout(250);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(SITE_ROOT, opts.out);

  await mkdir(outDir, { recursive: true });
  for (const entry of await readdir(outDir)) {
    if (entry.endsWith('.png') || entry === 'manifest.json') {
      await rm(path.join(outDir, entry), { force: true });
    }
  }

  if (!opts.skipBuild) {
    console.log('[screenshots] building…');
    await run('npm', ['run', 'build'], { PLAYWRIGHT: 'true' });
  }

  const server = await startPreview(opts.port);
  const browser = await chromium.launch();
  const captures = [];

  try {
    for (const theme of opts.themes) {
      for (const viewportName of opts.viewports) {
        const viewport = VIEWPORTS[viewportName];
        const context = await browser.newContext({
          baseURL: server.baseURL,
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
          hasTouch: viewport.isMobile,
          deviceScaleFactor: opts.scale,
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await context.addInitScript(
          ([key, value]) => {
            try {
              window.localStorage.setItem(key, value);
            } catch {
              /* storage unavailable — the inline bootstrap falls back to system */
            }
          },
          [THEME_STORAGE_KEY, theme],
        );

        const page = await context.newPage();
        for (const route of opts.routes) {
          const response = await page.goto(route, { waitUntil: 'networkidle' });
          const status = response?.status() ?? 0;
          await settle(page);

          const stem = `${theme}-${viewportName}-${routeSlug(route)}`;
          const height = await page.evaluate(() => document.documentElement.scrollHeight);

          const file = `${stem}.png`;
          await page.screenshot({
            path: path.join(outDir, file),
            fullPage: !opts.foldOnly,
          });
          captures.push({ file, route, viewport: viewportName, theme, status, pageHeight: height });
          console.log(`[screenshots] ${file}  (${route} → ${status}, ${height}px tall)`);

          // A 7000px full-page shot is fine for judging composition but useless
          // for judging type and spacing once it is scaled down to fit. Segments
          // keep detail readable.
          if (opts.segment > 0 && !opts.foldOnly && height > opts.segment) {
            const count = Math.ceil(height / opts.segment);
            for (let index = 0; index < count; index += 1) {
              const y = index * opts.segment;
              const segmentFile = `${stem}-s${index + 1}.png`;
              await page.screenshot({
                path: path.join(outDir, segmentFile),
                fullPage: true,
                clip: {
                  x: 0,
                  y,
                  width: viewport.width,
                  height: Math.min(opts.segment, height - y),
                },
              });
              captures.push({
                file: segmentFile,
                route,
                viewport: viewportName,
                theme,
                status,
                segment: { index: index + 1, of: count, top: y },
              });
            }
            console.log(`[screenshots]   + ${count} segments`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  const manifest = {
    outDir,
    routes: opts.routes,
    viewports: opts.viewports,
    themes: opts.themes,
    fullPage: !opts.foldOnly,
    captures,
  };
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const broken = captures.filter((capture) => capture.status >= 400 && capture.route !== '/404');
  if (broken.length > 0) {
    console.error(
      `[screenshots] non-OK routes: ${broken.map((c) => `${c.route} (${c.status})`).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[screenshots] ${captures.length} captures written to ${outDir}`);
}

main().catch((error) => {
  console.error(`[screenshots] failed: ${error.message}`);
  process.exitCode = 1;
});
