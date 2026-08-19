# Portfolio Chatbot

The portfolio chatbot runs in both the beta and production environments as two
independently deployed pieces:

```text
Astro widget on shanekanterman.dev (and beta.shanekanterman.dev)
   |
   | POST /api/chat
   v
Cloudflare Worker (portfolio-chat / portfolio-chat-beta)
   |
   | OpenAI Responses API
   v
gpt-5.6-luna
```

Worker routes intercept only `<hostname>/api/chat*`; every other request
continues through the existing Cloudflare Tunnel to Nginx. The beta hostname
remains protected by its Cloudflare Access application; production is public,
so the Worker is the only boundary in front of the model there. Keep request
validation tight and monitor OpenAI usage after production changes.

## One-time OpenAI setup

Each Worker is intentionally deployable before its model credential exists.
Until the credential is configured, `/api/chat/health` reports
`configured: false` and chat requests fail closed without exposing details.

1. Open Cloudflare **Workers & Pages**.
2. Select the Worker (**portfolio-chat** for production,
   **portfolio-chat-beta** for beta).
3. Open **Settings → Variables and Secrets**.
4. Add `OPENAI_API_KEY` as a **Secret**.
5. Deploy the new Worker version.

Do not add the OpenAI key to GitHub, the Astro build, Wrangler variables, or a
checked-in `.env` file.

After setting the secret, open `/api/chat/health` on the matching hostname and
confirm that `configured` is `true`. Then open the **Ask about Shane** widget
and ask a question such as "Tell me about Hostlet."

## Knowledge boundary

`chat-content/knowledge.json` is the sole approved factual source. It contains
manually reviewed professional facts and allowlisted portfolio routes. The
Worker does not crawl the repository, parse the PDF resume, browse the web, or
load infrastructure configuration.

When updating public portfolio facts:

1. Update the visible page or case study.
2. Review and update the corresponding knowledge entry.
3. Advance the knowledge version and `lastReviewed` date.
4. Add or update scope cases in `chat-content/prompt-scope.md`.
5. Run the Worker and browser test suites.

## Local validation

```sh
cd chat-worker
npm ci
npm run typecheck
npm test
npm run deploy:dry-run

cd ../site
npm ci
npm run test:e2e
```

Browser tests always build with `PUBLIC_CHAT_ENABLED=true` and mock the Worker;
they never call OpenAI. Deployment builds also set that flag so the widget
renders in every environment.

## Deployment and rollback

Pull requests into `beta` validate both packages. A successful deployment
publishes the branch's Worker (`portfolio-chat-beta` on `beta`,
`portfolio-chat` on `main`) before activating the static release, then
verifies the site and Worker health endpoints. Worker secrets remain stored by
Cloudflare across code deployments.

To disable the chatbot in an environment, roll its static site back to a
release from before the widget and restore the preceding Worker deployment or
remove its route. Neither action requires an Nginx, Tunnel, or portfolio-LXC
change.
