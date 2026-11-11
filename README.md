# GastroGraph Human Evaluation

Blind study: for each of 100 ingredients, a participant sees the dish it is used in and picks the best substitute among
up to three options (shuffled, source hidden):

| Model | Source |
|---|---|
| GastroGraph (functional GNN) | `gastrograph_sub` in `lib/questions.ts` |
| Embedding baseline | `embedding_sub` in `lib/questions.ts` |
| Context Reranker | `lib/context_subs.json` (generated) |

When two models suggest the same ingredient it is shown once, and choosing it credits both models.
Answers are saved to Supabase after every round of 10.

## Regenerating Context Reranker options

Run from the GastroGraph repo root (needs `models/` and `data/`):

```bash
python3 eval/scripts/build_context_subs.py      # dish context per ingredient: scripts/dish_contexts.json
python3 eval/scripts/fetch_context_images.py    # images for new substitutes -> public/ctx_*.jpg
```

The reranker skips candidates that are just a variant of the query (e.g. kiwi -> "kiwi fruit").

## Supabase setup

1. Create a project at supabase.com.
2. SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.
3. Project Settings -> API: copy the Project URL and the `anon` public key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. Results: open `/results` on the site (see below), or Table Editor -> `participants` / `responses`.

## Results dashboard (`/results`)

Password-protected page that reads every answer with the secret key (server-side only) and shows:

- **Preference share (3-way)** on answers where all three suggestions differ: shares sum to 100%, chance = 33.3%,
  95% Wilson CIs and a chi-square test against equal preference.
- **Head-to-head** for each model pair, with a two-sided sign test.
- **Pick rate** over all answers (shared suggestions credit both models) and **questions won** per model.
- Breakdowns **by profession** and **by ingredient familiarity**, and a **per-ingredient** vote table.
- **Download CSV**: every answer joined with participant details.

It needs two extra server-only variables (never prefix them with `NEXT_PUBLIC_`):

```
SUPABASE_SECRET_KEY=sb_secret_...
RESULTS_PASSWORD=choose-a-password
```

## Deploy on Vercel

1. Push this folder to its own GitHub repo.
2. vercel.com -> Add New Project -> import the repo (framework: Next.js, defaults are fine).
3. Settings -> Environment Variables: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SECRET_KEY` and `RESULTS_PASSWORD`, then deploy.
   (They are baked in at build time, so redeploy after changing them.)

## Local development

```bash
npm install
npm run dev
```
