# Architecture

## Principle

**The web app stores and organizes. ChatGPT grades.** There is no OpenAI API key and no model-inference service in this repository.

```text
Phone / desktop
   │
   ├── photos ───────────────────────────────┐
   └── short videos                         │
              │                             │
              ▼                             ▼
        Next.js web app ─────────────── Supabase
              │                       Postgres + private Storage
              │                             ▲
              ├── POST video job ───────────┤
              ▼                             │
       FFmpeg video worker                  │
       extract + score stills ──────────────┘

ChatGPT Pro / subscription
              │
              ▼
      Remote MCP server /mcp
              │
              ▼
       Next.js internal API
              │
              ├── read card + signed images
              ├── save grading run + defects
              └── save valuation
```

## Core entities

- `card_printings`: one printing/variant, e.g. Rayquaza 11/20 Dragon Vault regular holo.
- `physical_cards`: separate copies. The copy ID is the permanent identity.
- `media_assets`: original photos/videos/centering screenshots/contact sheets.
- `extracted_frames`: stills extracted from a video sweep.
- `grading_runs`: immutable grading history. Re-grading creates a new run.
- `grading_defects`: defect inventory tied to a grading run and optionally a specific image/frame.
- `valuations`: raw/graded values and sources at a point in time.
- `processing_jobs`: recoverable video work with attempts, status, and error details.
- `psa_submission_batches` / `psa_submission_items`: PSA submission membership and eventual cert/result tracking.

## Grading rules baked into MCP instructions

1. Defect-first inspection.
2. Centering / Corners / Edges / Surface are graded separately.
3. Each physical copy is independent.
4. Centering-app measurements override visual guesses.
5. Append, never replace, a grading run after completion.
6. Graded-value hierarchy: PSA exact-card/exact-grade recent sales median with 3+ comps → PSA Estimate → PriceCharting fallback.
7. Raw values: TCGplayer first, then PriceCharting; do not use eBay unless explicitly requested.
8. Expected value uses every supplied PSA 1–10 probability, including grades 5 and 6, and is gross rather than net.
