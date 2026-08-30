/**
 * CLI for the knowledge tools.
 *
 *   npm run knowledge:audit                  # Tier 0, deterministic, no model
 *   npm run knowledge:review -- [entryId...] # Luna reviews stale entries
 *   npm run knowledge:generate -- <path.mdx> # Luna drafts a new entry
 *
 * `audit` is the gate. `review` and `generate` print proposals for a human to
 * apply; neither writes to chat-content/knowledge.json. `review` exits
 * non-zero when any entry came back contradicted.
 */

import process from 'node:process';

import {
  createLunaClient,
  generateEntry,
  reviewEntry,
  type LunaClient,
  type ReviewResult,
} from './knowledge-agent.ts';
import { auditKnowledge, formatReport } from './knowledge-drift.ts';
import { createAuditIo, readKnowledgeDocument, readRepoFile, today } from './knowledge-io.ts';
import type { KnowledgeDocument, KnowledgeEntry } from '../src/types.ts';

const DEFAULT_MODEL = 'gpt-5.6-luna';

function loadDocument(): KnowledgeDocument {
  return readKnowledgeDocument() as KnowledgeDocument;
}

function requireClient(): LunaClient {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      'OPENAI_API_KEY is not set.\n' +
        'This command calls the model; the audit command does not and needs no key.',
    );
    process.exit(2);
  }
  return createLunaClient({
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    // Lets these commands be pointed at a stub or a gateway; unset in normal
    // use, where the client's own default applies.
    endpoint: process.env.OPENAI_RESPONSES_URL?.trim() || undefined,
  });
}

function runAudit(asJson: boolean): number {
  const report = auditKnowledge(loadDocument(), createAuditIo(), today());
  console.log(asJson ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.ok ? 0 : 1;
}

function printReview(entry: KnowledgeEntry, result: ReviewResult): void {
  const badge = { supported: 'SUPPORTED', contradicted: 'CONTRADICTED', incomplete: 'INCOMPLETE' }[
    result.verdict
  ];
  console.log(`\n── ${entry.id} — ${badge}`);
  console.log(`   source: ${entry.source.path}`);

  for (const issue of result.issues) console.log(`   ! ${issue}`);
  for (const item of result.missing) console.log(`   + missing: ${item}`);
  for (const item of result.sourceIssues) console.log(`   ~ source page: ${item}`);

  if (result.suggestedContent) {
    console.log('\n   suggested content:');
    console.log(`   ${result.suggestedContent}`);
  }

  // "Nothing to do" is only true when the claims hold *and* nothing is
  // missing. Saying it while listing omissions above trains you to skim past
  // the omissions.
  const clean =
    result.verdict === 'supported' &&
    result.issues.length === 0 &&
    result.missing.length === 0 &&
    result.sourceIssues.length === 0;
  if (clean && !result.suggestedContent) {
    console.log('   no change needed — bump lastReviewed to today after you confirm');
  } else if (!result.suggestedContent) {
    console.log('   no rewrite offered — decide whether the points above are worth folding in');
  }
}

async function runReview(ids: string[]): Promise<number> {
  const doc = loadDocument();
  const io = createAuditIo();

  // With no ids, review exactly what the deterministic pass flagged.
  let targets = ids;
  if (targets.length === 0) {
    const report = auditKnowledge(doc, io, today());
    targets = report.staleEntryIds;
    if (targets.length === 0) {
      console.log('No stale entries to review.');
      return 0;
    }
    console.log(`Reviewing ${targets.length} stale entr${targets.length === 1 ? 'y' : 'ies'}: ${targets.join(', ')}`);
  }

  const client = requireClient();
  let contradicted = 0;

  for (const id of targets) {
    const entry = doc.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      console.error(`Unknown entry id: ${id}`);
      return 2;
    }

    const result = await reviewEntry(client, entry, readRepoFile(entry.source.path));
    printReview(entry, result);
    if (result.verdict === 'contradicted') contradicted += 1;
  }

  console.log(
    `\nReviewed ${targets.length}; ${contradicted} contradicted. ` +
      'Apply any corrections by hand, then bump lastReviewed.',
  );
  // A contradicted entry means the bot is stating something the site does not,
  // which is the failure this tool exists to catch; exit non-zero so a caller
  // cannot treat it as a clean run.
  return contradicted > 0 ? 1 : 0;
}

async function runGenerate(sourcePath: string): Promise<number> {
  if (!sourcePath) {
    console.error('Usage: npm run knowledge:generate -- site/src/content/projects/<name>.mdx');
    return 2;
  }

  const entry = await generateEntry(
    requireClient(),
    sourcePath,
    readRepoFile(sourcePath),
    today(),
  );

  console.log('// Proposed entry — review every claim, then paste into chat-content/knowledge.json');
  console.log(JSON.stringify(entry, null, 2));
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'audit':
      return runAudit(rest.includes('--json'));
    case 'review':
      return runReview(rest.filter((arg) => !arg.startsWith('-')));
    case 'generate':
      return runGenerate(rest.find((arg) => !arg.startsWith('-')) ?? '');
    default:
      console.error('Usage: knowledge-cli <audit|review|generate> [args]');
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
