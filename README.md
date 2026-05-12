# CircleClick Competitive Analysis

Next.js prototype for a competitive analysis workspace. The current product
goal is to help startups and agencies turn public competitor evidence into an
editable, cited report draft.

## Files

- `src/app/page.tsx` renders the competitive analysis workspace.
- `src/app/api/analyze/route.ts` runs the server-side analysis flow.
- `src/lib/source-fetch.ts` fetches bounded public page text for each source.
- `public/dot-ribbon.js` registers the visual background custom element.
- `public/dots-pattern.webp` is the source image sampled into animated dots.

## Local development

Create `.env.local` with a server-only OpenAI key:

```bash
OPENAI_API_KEY=sk-...
```

Then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current flow

1. User enters a company, competitors, category, customer, and report goal.
2. The API route fetches public text from each URL.
3. OpenAI returns a structured comparison, opportunities, and report draft.
4. The UI shows the answer, evidence status, and source links.

## Current limitations

- No user accounts.
- No database or saved projects.
- No PDF or document export.
- No automated competitor discovery.
- Source fetching is intentionally small and bounded for the first prototype.

## Product rule

Every major insight should stay traceable to source evidence. If evidence is
missing, the output should say so instead of pretending certainty.
