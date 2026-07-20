# Meme Factory + Continuity Studio

Meme Factory is the production base for the Continuity Studio merge. The existing meme workflow stays compatible while the shared continuity core is introduced incrementally for memes, fashion shots, and storyboards.

## Phase 1 vertical slice

The current slice covers:

- immutable `Asset` / `AssetVersion` records and versioned reference images;
- legacy character and pose backfill without replacing the current character UI;
- deterministic Google/OpenAI reference routing with provider caps and explicit drop reasons;
- a persisted generation job containing the compiled prompt, exact reference manifest, hash, model, workflow version, points, and provider result;
- linking saved memes and generated outputs back to their generation job;
- a small reference-manifest summary in the existing meme generator UI.

The source of truth for database changes is `supabase/migrations`. Do not apply the old root `supabase-schema.sql` snapshot to an existing environment.

## Local setup

Requirements: Node.js 20+, npm, Supabase CLI, and Docker if running the full local Supabase stack.

```bash
npm install
supabase start
supabase db reset
npm run dev
```

Required server/client environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Provider keys remain server-side. The service role key must never use a `NEXT_PUBLIC_` prefix.

## Verification

```bash
npm run test
npx tsc --noEmit
npm run build
```

The repository currently has pre-existing whole-repo ESLint failures, mostly the React `set-state-in-effect` rule in legacy web/mobile surfaces. Validate changed files separately until that cleanup is completed.

## Continuity core

- `src/lib/continuity/reference-router.ts` applies deterministic provider budgets and category caps.
- `src/lib/continuity/meme-manifest.ts` compiles a stable manifest and SHA-256 hash for meme generation.
- `src/app/api/ai/generate-image/route.ts` persists the job before calling Gemini and records completion/failure afterward.
- `src/app/api/meme/save/route.ts` persists the output and links the existing meme transaction.
- `supabase/migrations/20260720083320_add_continuity_asset_core.sql` adds the schema, backfill, immutability triggers, grants, and RLS policies.

Next phases add the Character Reference Builder, reusable Look/Item/Environment/Style library UI, shot/version records, review/repair, and the OpenAI repair adapter.
