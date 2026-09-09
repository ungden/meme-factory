# Family script development and evidence-based rejection — 2026-09-09

The three rejected chat demos were assistant-authored examples, not outputs of AIDA. The audit identified a system problem nonetheless: a correct parody/role-reversal label and five favorable review fields were enough to accept a flat story. A compulsory rewrite did not first establish whether the premise was worth developing.

## Delivered behavior

`family-dialogue-6` preserves both reversed caregiving and recognizable adult-format parody. It now develops three distinct premises with sample dialogue and observable behavior, compares all three, and can reject all of them before drafting. The writer receives a short positive brief focused on human habits and responsive dialogue, rather than the full negative benchmark. Exploration uses a higher sampling temperature than review. The selected premise becomes a complete story. Review reads the staged dialogue/actions without the writer's premise labels or the selection's self-justification. Only a concrete revision decision can trigger one rewrite; unconditional rewriting was removed. Shot compilation still preserves exact dialogue, cast and listener references.

`family-editorial-2` includes negative anchors from the rejected demos and an additional false-positive house-tour sample discovered during this change. Positive excerpts and the weakest passage must cite actual lines/actions. Separate literal excerpts and text/action pairs are supported, but invented/paraphrased evidence fails validation. `formatOnly` blocks acceptance even when other review fields praise the script. The acceptance boolean is derived from the verdict, evidence and absence of unresolved issues; a second model-generated boolean cannot contradict that decision.

Candidates, comparisons, drafts, reviews and malformed responses are checkpointed in the existing creative-assist usage JSON. Success includes the trace in the saved story. The automatic production caller stores the same trace under its existing lease, without releasing it at intermediate checkpoints. Failed checks retain the previous user draft. The UI no longer incorrectly tells the user to simplify their idea after a quality rejection.

Each writing pass has a 155-second budget, one malformed-response repair across the pass, and at most one editorial revision. Network failures are not disguised as malformed JSON and retried. A checkpoint failure stops later model stages. This is bounded request-based text work; it is not a claim that the broader production orchestration has become a durable resumable writer.

## Live evaluation and limitations

- Initial test `04ea1772-959c-4677-9370-ee169eebd5c2` completed in 67 seconds but received an unjustifiably positive review for a tour mostly renaming pillows/cookies with grand terminology. Operator rejected that as proof of improvement and tightened the benchmark/counterargument requirement.
- Calibration `aa290336-a004-41e8-b987-3500b1d9fec9` re-reviewed that exact draft and returned `reject`, `formatOnly=true`. Its multi-excerpt citation exposed an overly strict contiguous-quote validator; all excerpts were checked against the source, and the stored response was revalidated without another model call.
- Caregiving test `7b9c8052-7b03-4082-be8a-0450e96b8641` was rejected as a list of unrelated morning behaviors. Its ellipsis-separated literal excerpts exposed the same citation-format issue, now covered by a regression test. A rejected story is not a finished user deliverable.
- Parody test `c5bb489e-59ed-4775-9e37-60124b58e031` preserved the selected scene and made one local ending revision, then stopped on a negative review. Both drafts survived; no media was generated. This test also exposed a contradictory model `passed` boolean, which the final contract no longer requests or trusts.

These are model/validator evaluations, not audience tests, human approval, or proof that every future script is funny. No new film, voice, image or schedule was started. Existing saved plans were not rewritten.

## QA quota isolation

Operator tests had consumed the same 30-per-day allowance as user writing. The additive `creative_assist_qa_exemptions` table now records explicitly reviewed QA IDs separately from client-editable job JSON. Only the service role can read/write exemptions. `creative_assist_usage()` accepts no user ID and returns counts only for `auth.uid()`; anonymous execution is revoked and the definer has an empty search path. The API fails closed if usage cannot be read. The 5/minute and 30/day user limits stay unchanged.

Twenty existing operator QA jobs were classified without deleting history or changing creation timestamps. Real Postgres readback under `authenticated` returned 10 daily user calls; an unrelated actor returned zero. Table insert/select privileges for `authenticated` and function execute for `anon` were false, and RLS was enabled. Function security follows the [Supabase database function guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

## Automated verification

216 tests pass across 25 files, including rejection despite well-formed JSON, all-premise rejection, exact cast/shot preservation, one-revision bounds, invented evidence, combined excerpts, contradictory flags, deadline and checkpoint failure. TypeScript, ESLint and production build pass. These tests verify contracts and recovery boundaries, not comedic quality.

Channel profile 6 was added for Bánh Bao & Đậu Đỏ with the same four character IDs. The profile/history remains versioned. Migration `20260909124329_add_creative_assist_qa_exemptions` was applied and matched to local migration history. Release and final canary readback are recorded below when available.

## Final shared-planner canary

`633dec54-db50-492c-8e19-2b78e750de79` completed in 53.9 seconds after the short positive writer brief was introduced. With an empty idea, it compared three premises and selected a toy-product reviewer whose claim is challenged by the sibling who saw what happened. Four exact speaking turns and a reaction compiled into five shots; identity references and dialogue were inspected. The verdict is a candidate for user review, not human approval or evidence of audience response. No minimum dialogue length was added just to stretch it to 35 seconds.

The final rejection-path canary `ff9c418b-b345-4021-a08e-6c89def01878` also demonstrated all three premises being rejected before any full script or shot generation. Both final operator calls were marked QA before execution, leaving the user's usage count at ten. Security advisor's informational no-policy finding on the exemption table is intentional: it has no client grants and is service-only.

## Explicit stopping points and natural speaker viewpoint

`family-dialogue-8` and `family-editorial-4` separate a complete abrupt ending from an unfinished tail. New AI stories must declare an ending mode, exact final dialogue line and a literal anchor from that line. The independent reviewer reads backward and records `clean_stop`, `forced_tail` or `unfinished`; a claimed ready verdict is downgraded when the true stopping point is earlier than the draft. A forced tail is removed during the single bounded revision instead of being replaced by another punchline. Legacy saved stories remain readable and are not rewritten.

The legacy free-text reaction field can no longer create an extra final shot unless the explicit ending mode is `silent_reaction`. This prevents a spoken final line from being repeated as a paid silent scene. Development checkpoints now retain the proposed ending plan alongside each draft and review.

The reviewer also records a separate speech check grounded in a literal line. It validates pronouns from the actual speaker/listener viewpoint and rejects translated or author-narrated phrasing. For example, a child speaking to their sibling uses “chị em mình/tụi mình”, while “tụi con” is used toward parents; the child does not refer to the pair as “hai đứa”. A failed speech check forces revision even if premise and ending are otherwise acceptable.

The first profile-7 text canary `263e76e3-2008-4626-901b-f9d73fd26a49` proved the ending constraint but exposed “Thôi hai đứa tự đi...”. It was operator QA, generated no media and did not save a plan. Profile 8 added the independent speech gate. Canary `70636cf3-d0c2-4873-a99d-96f15dac7fc1` then completed with five spoken shots and stopped at: “Thôi hai người cứ ngủ đi, chị em mình đi bộ cũng được.” The reviewer grounded both `clean_stop` and `natural` on that final line. The project still had 15 saved plans before and after the run; no image, voice or video job was created.

The earlier profile-7 canary `6befcafc-97ed-470d-9913-8bf1e211a22c` also exposed a compatibility bug: the model placed a spoken final decision in the old reaction description while declaring a resolved ending. The run failed before shot planning. The compiler now treats the explicit ending plan as authoritative, and the behavior has regression coverage.
