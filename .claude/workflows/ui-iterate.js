export const meta = {
  name: 'ui-iterate',
  description: 'Screenshot-driven UI loop: Opus briefs and reviews, Sonnet implements, repeat until approved',
  whenToUse:
    'Any visual change or new UI feature in site/. Pass args: {goal, routes?, rounds?, themes?, viewports?, focus?}. The goal should read like a design request ("tighten the hero", "add a contact card"), not a file list.',
  phases: [
    { title: 'Baseline', detail: 'build the site and capture how it looks today' },
    { title: 'Brief', detail: 'Opus turns the goal into an implementation statement', model: 'opus' },
    { title: 'Implement', detail: 'Sonnet edits code, rebuilds, recaptures screenshots', model: 'sonnet' },
    { title: 'Review', detail: 'Opus reviewers look at the screenshots and the diff', model: 'opus' },
    { title: 'Verify', detail: 'full build + Playwright suite + Opus sign-off', model: 'opus' },
  ],
}

// ---------------------------------------------------------------- parameters

// Args can arrive as an object or as a JSON string depending on how the caller
// serialized them; accept either rather than failing on the string form.
function readArgs(raw) {
  if (raw == null) return {}
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return { goal: raw }
  }
}

const input = readArgs(args)

const REPO = input.repo ?? '/home/shane/projects/portfolio'
const SITE = `${REPO}/site`
const OUT_ROOT = input.outDir ?? `${SITE}/.ui-iterate`

const GOAL = input.goal
if (!GOAL) {
  throw new Error('ui-iterate requires args.goal — describe the UI change you want.')
}

const ROUTES = input.routes ?? [
  '/',
  '/projects/hostlet',
  '/projects/kanterlabs-homelab',
  '/projects/multi-node-portfolio',
  '/projects/data-center-operations',
  '/404',
]
const VIEWPORTS = input.viewports ?? ['desktop', 'mobile']
const THEMES = input.themes ?? ['dark', 'light']
const ROUNDS = input.rounds ?? 2
const FOCUS = input.focus ?? ''

const routeList = ROUTES.join(',')
const viewportList = VIEWPORTS.join(',')
const themeList = THEMES.join(',')

// ------------------------------------------------------- repo house rules
// Standing constraints for this repo. Every agent in the loop gets these, so a
// future run inherits the same guardrails without the user restating them.

const HOUSE_RULES = `
Repo: ${REPO} (Astro 6 + Tailwind v4 static portfolio). All site work happens in ${SITE}.
Current branch is \`beta\`; \`beta\` pushes deploy to beta.shanekanterman.dev, so keep it green.

Standing rules for this site — violating any of these is a defect, not a preference:
- NO screenshot-diff baselines. Never add \`toHaveScreenshot()\`. Visual guarantees are
  written as targeted Playwright assertions: bounding boxes, computed styles, axe scans,
  and the helpers in tests/helpers/ (contrast.ts, touchTargets.ts, navigation.ts).
- \`/greenlit\` is intentionally out of scope. Do not edit it, test it, or screenshot it.
- Hiding the hero card and ArchitectureSnapshot on mobile is a deliberate design decision.
  Do not "fix" it, and do not report it as a bug.
- Tailwind v4 gotcha: \`max-[780px]\` compiles to \`(width < 780px)\` — strict less-than. The
  complementary rule must be \`(width >= 780px)\`, never \`min-width: 781px\`.
- Content collections live in src/content/projects/*.mdx; shared styles in
  src/styles/global.css; layout shells in src/layouts/.
- Accessibility is not optional: visible focus rings, 44px touch targets, WCAG AA contrast
  in BOTH themes, and headings that stay in order.
`.trim()

const CAPTURE_HOWTO = `
Screenshots are produced by a script in the repo — do not hand-roll Playwright:

  cd ${SITE} && node scripts/ui-screenshots.mjs --out <dir> \\
    --routes ${routeList} --viewports ${viewportList} --themes ${themeList}

It builds the site, starts its own preview server, captures every
theme x viewport x route combination as a full-page PNG, and writes manifest.json
listing them. Add \`--skip-build\` only if you just built. Add \`--segment 1400\` to also
slice tall pages into legible sections, and \`--scale 2\` for fine typographic detail —
both are the right move when a full-page shot is too tall to judge.
`.trim()

// ------------------------------------------------------------------ schemas

const CAPTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'outDir', 'files', 'observations'],
  properties: {
    ok: { type: 'boolean' },
    outDir: { type: 'string' },
    files: { type: 'array', items: { type: 'string' }, description: 'absolute PNG paths' },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description: 'anything notable — broken routes, console errors, capture failures',
    },
  },
}

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['statement', 'designIntent', 'changes', 'acceptanceCriteria', 'nonGoals', 'testGuidance'],
  properties: {
    statement: { type: 'string', description: 'the implementation statement the worker executes' },
    designIntent: { type: 'string', description: 'what the result should feel like and why' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'intent'],
        properties: { file: { type: 'string' }, intent: { type: 'string' } },
      },
    },
    acceptanceCriteria: {
      type: 'array',
      items: { type: 'string' },
      description: 'observable, checkable conditions — each one either holds or does not',
    },
    nonGoals: { type: 'array', items: { type: 'string' } },
    testGuidance: { type: 'string', description: 'which assertions in tests/ to add or update' },
  },
}

const WORKER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'filesChanged', 'buildOk', 'testsRun', 'captureDir', 'unresolved'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    buildOk: { type: 'boolean' },
    testsRun: { type: 'string', description: 'what was run and the result, or why not run' },
    captureDir: { type: 'string' },
    unresolved: {
      type: 'array',
      items: { type: 'string' },
      description: 'feedback items deliberately not addressed, with the reason',
    },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'screenshotsRead', 'mustFix', 'niceToHave', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise'] },
    screenshotsRead: {
      type: 'array',
      items: { type: 'string' },
      description: 'the image files you actually opened — judging without looking is not a review',
    },
    mustFix: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issue', 'where', 'evidence', 'fix'],
        properties: {
          issue: { type: 'string' },
          where: { type: 'string', description: 'route + viewport + theme, and the file if known' },
          evidence: { type: 'string', description: 'the screenshot or code that shows it' },
          fix: { type: 'string' },
        },
      },
    },
    niceToHave: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['buildOk', 'testsOk', 'testSummary', 'shipReady', 'residualRisks', 'report'],
  properties: {
    buildOk: { type: 'boolean' },
    testsOk: { type: 'boolean' },
    testSummary: { type: 'string' },
    shipReady: { type: 'boolean' },
    residualRisks: { type: 'array', items: { type: 'string' } },
    report: { type: 'string', description: 'short human-facing summary of what changed and how it looks' },
  },
}

// ------------------------------------------------------------------- lenses
// Three reviewers, three different failure modes. Redundant reviewers would all
// find the same obvious thing and miss the rest.

const LENSES = [
  {
    key: 'composition',
    title: 'Visual hierarchy and craft',
    reads: 'the DESKTOP captures in both themes',
    charge: `Judge this as a designer looking at a portfolio that is trying to get its author hired
for infrastructure and platform work. Look for: broken vertical rhythm, sections that all
carry the same weight so nothing leads, inconsistent spacing scale, type sizes that do not
form a clear ladder, misaligned edges between adjacent cards, orphaned or widowed lines,
cramped or ballooning line length, dead space that reads as a mistake rather than a pause,
and colour that draws the eye to the wrong element. Compare dark and light: a treatment that
carries in one theme and collapses in the other is a defect.`,
  },
  {
    key: 'responsive',
    title: 'Mobile, responsive behaviour, accessibility',
    reads: 'the MOBILE captures in both themes (and desktop only for comparison)',
    charge: `Judge this on a 390px phone. Look for: horizontal overflow, text pushed under the sticky
header, tap targets under 44px or crowded together, content that wraps into an awkward shape,
tables and diagrams that escape their container, stacked cards with no breathing room, and
contrast that fails AA in either theme. Check that anything hidden on mobile leaves a coherent
page behind rather than a gap. Run the a11y suite yourself if a claim needs proof:
\`cd ${SITE} && npx playwright test tests/accessibility.spec.ts\`.`,
  },
  {
    key: 'code',
    title: 'Implementation quality and test integrity',
    reads: 'the git diff first, then whichever captures the diff makes you suspicious of',
    charge: `Read \`cd ${REPO} && git diff\` and judge the implementation, not the picture. Look for:
duplicated or dead CSS, magic numbers where a design token exists, one-off overrides that
should be a component change, Tailwind v4 breakpoint mistakes (see the house rules), inline
styles that belong in global.css, components edited in a way that silently changes other
routes, and tests that were weakened, deleted, or replaced with screenshot baselines to make
the change pass. A change with no test covering its observable behaviour is a mustFix when
the behaviour is assertable.`,
  },
]

// -------------------------------------------------------------------- prompts

const context = `${HOUSE_RULES}\n\n${CAPTURE_HOWTO}`

function capturePrompt(dir, label) {
  return `${context}

TASK: capture the ${label} state of the site.

Run the screenshot script with --out ${dir}. If a route fails to load or the script exits
non-zero, say so in observations rather than pretending it worked. Return the absolute path
of every PNG written (read ${dir}/manifest.json for the list).

Do not edit any source file. This is a capture step only.`
}

function briefPrompt(baseline) {
  return `${context}

You are the design lead. A Sonnet worker will execute your statement literally and will not
have your judgement, so the statement has to carry it.

THE REQUEST: ${GOAL}
${FOCUS ? `\nEXTRA FOCUS: ${FOCUS}\n` : ''}
BASELINE SCREENSHOTS: ${baseline?.outDir ?? OUT_ROOT + '/round-0'}
${(baseline?.files ?? []).map((file) => `  - ${file}`).join('\n')}

Do this before writing anything:
1. Read the baseline screenshots — the desktop and mobile captures for every affected route,
   in BOTH themes. You are diagnosing the current design, so look at it.
2. Read the source that produces what you saw (src/pages/, src/components/, src/layouts/,
   src/styles/global.css) and the existing tests in tests/.

Then write an implementation statement that:
- names the concrete visual outcome, not the mechanism ("the hero states the role in one line
  and the metrics sit under it as a single row" — not "add flexbox");
- lists the specific files to change and what each change is for;
- gives acceptance criteria a reviewer can check against a screenshot or an assertion;
- states non-goals explicitly, including anything in the house rules the worker might
  otherwise "helpfully" touch;
- says which Playwright assertions to add or update so the change is actually protected.

Be decisive. Pick one direction and specify it. Do not hand the worker a menu of options.`
}

function workerPrompt(brief, feedback, round, dir) {
  const feedbackBlock =
    feedback.length === 0
      ? 'This is the first round — implement the statement as written.'
      : `REVIEW FEEDBACK FROM ROUND ${round - 1} — every item below must be resolved or
explicitly justified in \`unresolved\`:

${feedback.map((item, index) => `${index + 1}. [${item.lens}] ${item.issue}\n   where: ${item.where}\n   evidence: ${item.evidence}\n   suggested fix: ${item.fix}`).join('\n\n')}`

  return `${context}

You are implementing round ${round} of a UI change in ${SITE}.

IMPLEMENTATION STATEMENT
${brief.statement}

DESIGN INTENT
${brief.designIntent}

PLANNED CHANGES
${brief.changes.map((change) => `  - ${change.file}: ${change.intent}`).join('\n')}

ACCEPTANCE CRITERIA
${brief.acceptanceCriteria.map((criterion) => `  - ${criterion}`).join('\n')}

NON-GOALS
${brief.nonGoals.map((goal) => `  - ${goal}`).join('\n')}

TEST GUIDANCE
${brief.testGuidance}

${feedbackBlock}

Work in this order:
1. Edit the source. Follow the surrounding conventions — this codebase has a house style,
   match it rather than importing your own.
2. Add or update the Playwright assertions described above, in ${SITE}/tests/.
   Targeted assertions only; no screenshot baselines.
3. \`cd ${SITE} && npm run build\` — it must succeed.
4. Run the tests you touched, plus \`npx playwright test tests/accessibility.spec.ts\`.
   If something fails, fix it; do not weaken the assertion to make it pass.
5. Capture the result: \`node scripts/ui-screenshots.mjs --out ${dir}\` with the standard
   route/viewport/theme flags above.
6. Look at your own screenshots before returning. If the result does not match the design
   intent, iterate now rather than shipping it to review.

Report honestly: if the build or a test failed and you could not fix it, say so.`
}

function reviewPrompt(lens, brief, work, round) {
  return `${context}

You are reviewing round ${round} of a UI change. Your lens: ${lens.title}.

WHAT WAS ASKED FOR
${GOAL}

DESIGN INTENT
${brief.designIntent}

ACCEPTANCE CRITERIA
${brief.acceptanceCriteria.map((criterion) => `  - ${criterion}`).join('\n')}

NON-GOALS (do not report these as problems)
${brief.nonGoals.map((goal) => `  - ${goal}`).join('\n')}

WHAT THE WORKER DID
${work.summary}
Files changed: ${work.filesChanged.join(', ') || '(none reported)'}
Build ok: ${work.buildOk}. Tests: ${work.testsRun}
${work.unresolved.length > 0 ? `Left unresolved: ${work.unresolved.join('; ')}` : ''}

SCREENSHOTS: ${work.captureDir} (read manifest.json for the full list)
Start with ${lens.reads}.

YOUR CHARGE
${lens.charge}

Rules for this review:
- Open the images. Read them with the Read tool; a review written without looking at a
  screenshot is worthless, and \`screenshotsRead\` must list what you actually opened.
  If a full-page capture is too tall to judge, re-run the script with --segment 1400.
- Every mustFix needs evidence a person can check: name the image and where in it, or the
  file and line. "Feels unbalanced" without a location is not a finding.
- Judge against the design intent and the acceptance criteria, not against your own taste
  for a different design. Scope creep in a review is as costly as scope creep in an edit.
- Do not report anything listed in the non-goals or the house rules as intended behaviour.
- \`approve\` means you would ship this. A short list of niceToHave items is compatible with
  approve; anything in mustFix is not.
- Be willing to approve. Manufacturing a mustFix to look thorough sends the loop around
  again for nothing.`
}

function verifyPrompt(brief, rounds, dir) {
  return `${context}

The UI change is finished and needs a final gate before the user sees it.

WHAT WAS ASKED FOR
${GOAL}

ACCEPTANCE CRITERIA
${brief.acceptanceCriteria.map((criterion) => `  - ${criterion}`).join('\n')}

ROUNDS RUN: ${rounds}
FINAL SCREENSHOTS: ${dir}

Do all of this:
1. \`cd ${SITE} && npm run build\`
2. \`cd ${SITE} && npx playwright test\` — the whole suite, both projects. Report the real
   result; a failing suite means shipReady is false, whatever the screenshots look like.
3. \`cd ${REPO} && git diff --stat\` and skim the diff for anything that does not belong
   (debug code, commented-out blocks, unrelated files, weakened assertions).
4. Read the final desktop and mobile captures in both themes and confirm each acceptance
   criterion actually holds.

Then write a short report for the user: what changed, how it looks now, what the tests say,
and anything they should decide on. Plain prose, no marketing. Do not commit anything.`
}

// --------------------------------------------------------------------- run

log(`Goal: ${GOAL}`)
log(`Routes: ${routeList} | viewports: ${viewportList} | themes: ${themeList} | max rounds: ${ROUNDS}`)

phase('Baseline')
const baseline = await agent(capturePrompt(`${OUT_ROOT}/round-0`, 'current (pre-change)'), {
  label: 'capture:baseline',
  phase: 'Baseline',
  model: 'sonnet',
  effort: 'low',
  schema: CAPTURE_SCHEMA,
})
if (!baseline?.ok) {
  log(`Baseline capture reported trouble: ${(baseline?.observations ?? ['no result']).join('; ')}`)
}

phase('Brief')
const brief = await agent(briefPrompt(baseline), {
  label: 'brief:design-lead',
  phase: 'Brief',
  model: 'opus',
  effort: 'high',
  schema: BRIEF_SCHEMA,
})
log(`Brief: ${brief.statement.slice(0, 220)}…`)

let feedback = []
let lastWork = null
let approvedAt = null
const history = []

for (let round = 1; round <= ROUNDS; round += 1) {
  const dir = `${OUT_ROOT}/round-${round}`

  phase(`Implement r${round}`)
  const work = await agent(workerPrompt(brief, feedback, round, dir), {
    label: `implement:r${round}`,
    phase: `Implement r${round}`,
    model: 'sonnet',
    effort: 'high',
    schema: WORKER_SCHEMA,
  })
  lastWork = work ?? lastWork

  if (!work) {
    log(`Round ${round}: worker returned nothing — stopping.`)
    break
  }
  if (!work.buildOk) {
    log(`Round ${round}: build failed, skipping review and sending the failure back.`)
    feedback = [
      {
        lens: 'build',
        issue: 'The build does not succeed after your changes.',
        where: SITE,
        evidence: work.testsRun || work.summary,
        fix: 'Fix the build first; nothing else can be reviewed until it compiles.',
      },
    ]
    history.push({ round, verdicts: ['build-failed'], mustFixCount: 1 })
    continue
  }

  phase(`Review r${round}`)
  const reviews = await parallel(
    LENSES.map((lens) => () =>
      agent(reviewPrompt(lens, brief, work, round), {
        label: `review:${lens.key}:r${round}`,
        phase: `Review r${round}`,
        model: 'opus',
        effort: 'high',
        schema: REVIEW_SCHEMA,
      }).then((review) => (review ? { ...review, lens: lens.key } : null)),
    ),
  )

  const landed = reviews.filter(Boolean)
  const blocking = landed.flatMap((review) =>
    review.mustFix.map((item) => ({ ...item, lens: review.lens })),
  )
  history.push({
    round,
    verdicts: landed.map((review) => `${review.lens}:${review.verdict}`),
    mustFixCount: blocking.length,
    niceToHave: landed.flatMap((review) => review.niceToHave),
  })

  log(
    `Round ${round}: ${landed.map((review) => `${review.lens} ${review.verdict}`).join(', ')} — ` +
      `${blocking.length} blocking item(s)`,
  )

  if (blocking.length === 0) {
    approvedAt = round
    break
  }
  if (round === ROUNDS) {
    log(`Round budget spent with ${blocking.length} item(s) still open — they go in the report.`)
  }
  feedback = blocking
}

phase('Verify')
const finalDir = lastWork?.captureDir ?? `${OUT_ROOT}/round-${Math.max(1, history.length)}`
const verification = await agent(verifyPrompt(brief, history.length, finalDir), {
  label: 'verify:sign-off',
  phase: 'Verify',
  model: 'opus',
  effort: 'high',
  schema: VERIFY_SCHEMA,
})

return {
  goal: GOAL,
  brief,
  rounds: history,
  approvedAtRound: approvedAt,
  openItems: approvedAt ? [] : feedback,
  finalScreenshots: finalDir,
  verification,
}
