# Portfolio Chatbot

The portfolio chatbot is production-only and runs as two independently
deployed pieces:

```text
Astro widget on shanekanterman.dev
   |
   | POST /api/chat
   v
Cloudflare Worker (portfolio-chat)
   |\
   | \-- D1 (portfolio-chat-history)
   |
   \---- OpenAI Responses API → gpt-5.6-luna
```

The Worker route intercepts only `shanekanterman.dev/api/chat*`; every other
request continues through the OVH Caddy edge to Nginx. The site is public, so
the Worker is the application boundary in front of the model. The Tailnet-only
candidate validates Worker code but does not publish a beta Worker or expose a
candidate chat API.

## One-time OpenAI setup

Each Worker is intentionally deployable before its model credential exists.
Until the credential is configured, `/api/chat/health` reports
`configured: false` and chat requests fail closed without exposing details.

1. Open Cloudflare **Workers & Pages**.
2. Select the **portfolio-chat** Worker.
3. Open **Settings → Variables and Secrets**.
4. Add `OPENAI_API_KEY` as a **Secret**.
5. Deploy the new Worker version.

Do not add the OpenAI key to GitHub, the Astro build, Wrangler variables, or a
checked-in `.env` file.

After setting the secret, open `/api/chat/health` on the production hostname
and confirm that `configured` is `true`. Then open the **Ask about Shane**
widget and ask a question such as "Tell me about Hostlet."

## D1 chat history

The Worker stores each accepted request in the `CHAT_HISTORY` D1 binding. A
record contains the visitor UUID, environment, page path, user message, the
bounded request history supplied to the model, assistant response, public
source links, model and knowledge versions, outcome, timestamps, and duration.
It does not store IP addresses, user agents, credentials, hidden reasoning, or
raw upstream errors. The widget tells visitors that chat content is stored and
asks them not to submit sensitive information.

History writes are best effort. A missing binding or temporary D1 failure does
not break chat delivery. The health endpoint reports `historyConfigured` so a
deployed environment can be checked without exposing database details.

The one-time resource setup is:

```sh
cd chat-worker
npx wrangler login
npx wrangler d1 create portfolio-chat-history --binding CHAT_HISTORY
```

Add the returned database name and UUID as the `CHAT_HISTORY` D1 binding for
`env.production` in `wrangler.toml`, then apply the migration:

```sh
npm run d1:migrate:production
```

The production-provider release procedure applies pending migrations before
deploying the Worker. D1 records are retained until explicitly deleted. To
inspect recent production exchanges without printing credentials:

```sh
npx wrangler d1 execute CHAT_HISTORY --remote --env production --command \
  "SELECT started_at, page_path, status, duration_ms FROM chat_exchanges ORDER BY started_at DESC LIMIT 25"
```

## Knowledge boundary

`chat-content/knowledge.json` is the sole approved factual source. It contains
manually reviewed professional facts and allowlisted portfolio routes. The
Worker does not crawl the repository, parse the PDF resume, browse the web, or
load infrastructure configuration.

When updating public portfolio facts:

1. Edit the visible page or case study and commit it. The audit derives
   staleness from git history, so uncommitted edits are invisible to it.
2. For a new page run `npm run knowledge:generate -- <path.mdx>`; for a
   changed page run `npm run knowledge:review -- <entryId…>`. Both require
   `OPENAI_API_KEY` and only print a proposal; review exits non-zero when an
   entry is contradicted by its source. Apply the proposal by hand to
   `chat-content/knowledge.json`.
3. Update `lastReviewed` on every touched entry and bump `version` in
   `chat-content/knowledge.json`. The version now lives only there;
   `/api/chat/health` reports it after the next Worker deploy. There is no
   `wrangler.toml` `KNOWLEDGE_VERSION` var anymore.
4. Run `npm run knowledge:audit` until it is clean. CI runs the same audit in
   the chat-worker validation job and blocks merges on it.
5. Update scope cases in `chat-content/prompt-scope.md` (manual, not
   enforced), then run the Worker and browser test suites.

A case study can set `draft: true` in its frontmatter. A draft page is not
built and not listed, it is exempt from knowledge-coverage checks, and the
audit rejects any knowledge entry that sources it. Drafting the featured
project or the experience entry fails the homepage build, which expects both
to exist.

## Local validation

```sh
cd chat-worker
npm ci
npm run typecheck
npm test
npm run d1:migrate:local
npm run deploy:dry-run

cd ../site
npm ci
npm run test:e2e
```

Browser tests always build with `PUBLIC_CHAT_ENABLED=true` and mock the Worker;
they never call OpenAI. Deployment builds also set that flag so the widget
renders in every environment.

## Deployment and rollback

Pull requests into `beta` validate both packages without publishing a Worker.
Static candidate deployment and exact-artifact promotion are independent of
the production-provider Worker release. A production Worker deployment must
apply migrations, deploy `portfolio-chat`, and verify both the site and Worker
health endpoints. Worker secrets remain stored by Cloudflare across code
deployments.

To disable the chatbot in an environment, roll its static site back to a
release from before the widget and restore the preceding Worker deployment or
remove its route. Neither action requires an Nginx, Tunnel, or portfolio-LXC
change. Rolling back Worker code does not delete D1 data or reverse migrations.
