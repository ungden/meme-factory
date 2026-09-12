# Paid AI watermarks

Brand settings offers background removal (JPEG/PNG/WebP input) and new watermark creation. Both use direct OpenAI GPT Image 1.5, medium quality, 1536×1024 PNG with a transparent background. Existing image/video model selection is unchanged.

The owner requests a 15-minute immutable quote, then explicitly accepts it. An 11-point maximum is held using the project ledger; actual OpenAI usage is billed at cost ×1.30 (26,500 VND/USD, 500 VND/point, whole-point ceiling), capped at the accepted maximum. The remainder is refunded transactionally. Invalid/opaque output is not applied and the customer receives the hold back.

`watermark_ai_jobs` and its RPCs are service-only. Quotes are scoped to owner, project and workspace version; accepting a quote UUID is idempotent. One unresolved job per project/workspace prevents duplicate submissions. UI only receives safe status/output fields; raw input images expire with unused quotes and are cleared after completion.

Railway invokes `WATERMARK_PROCESSOR_URL/api/internal/watermark-jobs` with `VIDEO_WORKER_TOKEN`. Production points this at https://aida.vn, where the existing sensitive `OPENAI_API_KEY` is configured. The image-only processor has a 240-second function budget and a 180-second provider timeout. Video rendering stays on Railway. Lease is 90 seconds with a 30-second heartbeat. It is possible to move image execution locally by configuring the same OpenAI secret on Railway and pointing at its local listener; do not export secrets through the status API.

The provider output is checkpointed before validation/upload. Storage failure retries that checkpoint; it never calls OpenAI again. Storage uses immutable job paths with SHA-256 verification. A submission with unknown outcome or a crash before checkpoint becomes `needs_review`, preserving the hold for operator reconciliation rather than issuing another paid generation. `request_id` and `usage` are service-only evidence; do not refund an unknown submission without reconciling the provider record. Alpha validation failures are customer-refunded without automatic regeneration.

Result selection only fills the watermark form. The owner presses Save settings to apply it to future content. Prior content is unchanged.

Verification: quote/run authorization tests, real PostgreSQL rollback tests for duplicate holds/refunds and stale lease owners, provider/storage fault fixtures, transparent pixel validation, responsive UI and production quote without paid generation. Actual model output quality still needs a user-triggered generation.

Sources: https://developers.openai.com/api/docs/guides/image-generation and https://developers.openai.com/api/docs/models/gpt-image-1.5 .
