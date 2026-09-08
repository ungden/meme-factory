# Short-film v2

The video and short-film screens remain independent. Single clips retain their existing provider path. Short films use server-issued immutable quotes and PostgreSQL tasks linked to generation_jobs. Browser writes to plans, quotes, job state and reviews are denied; route handlers authenticate and scope project/workspace before server-only RPCs.

## Execution and recovery

Stage order: approved character voice samples → versioned script → scene image/TTS → explicit image/audio review → Seedance → lip-sync → independent ASR → scene review → render → final review. Every paid stage has a fresh quote using actual source media. Fixed voice remains off unless SHORT_FILM_FIXED_VOICE_ENABLED=true; enable only for canary while testing, then broader release after human voice/visual approval. Do not auto-approve samples.

Provider models: gemini-3.1-flash-image (existing image adapter), minimax/speech-2.6-hd, bytedance/seedance-2.5/image-to-video, sync/lipsync-2-pro, wavespeed-ai/openai-whisper-with-video. No implicit model fallback. Native mode is separately labelled; it is not a fixed-voice promise. TTS uses documented 44100 Hz WAV; render converts to 48000 Hz AAC. Lip-sync uses silence mode with real audio duration; no speculative image URL is used to price a video stage.

Accepting a quote and reserving points is one transaction. Reusing a quote returns its original run; reusing an idempotency key for another quote is rejected. Worker claims/heartbeats/finalization use owner plus unexpired lease. At most two non-render stages and one render/frame stage may run. Callback records evidence only. Unknown submission remains reconciling and holds its slot/points until an operator verifies the prediction; NEVER reset submitting or retry a paid POST without reconciling. Downloads and uploads retry from provider-completed checkpoint. Local failures stop after three attempts. Retry API only resumes persisted provider results or local render/frame, not generation.

Definitive provider rejection and cancelled, never-submitted dependencies refund stage points once. Ambiguous/processed requests never auto-refund. Completed image/audio/clip tasks require explicit human review; ASR is not evidence of correct face or lips. Original outputs stay reachable after script changes. Dependencies become stale when a new image/audio/clip is selected, even if the scene text is unchanged.

Railway requires existing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WAVESPEED_API_KEY, GEMINI_API_KEY and AIDA_BASE_URL. The container includes FFmpeg/libass and Noto fonts. No production credentials belong in this repository.

## Source provenance

Ported design, not the complete Rocklore pipeline. Source checkout a586637; inspected working-file SHA256:

- services/render/vocab-kids/core.ts: cf7a04f13fc5cca1d21885b66f683b1f571548f68e590001226e05c7451ced3d
- services/render/fashion-channel.ts: 3b73aaf3172d319e0cb27b813de592b36b7630810a589354556e93c19184eefc

Retained: speech-first timing, clip normalization, concat/ASS approach and frozen cast. Removed: lesson-specific prompts, looping to stretch clips and automatic paid regeneration. ASR input excludes expected dialogue; comparison runs afterwards.

## Verification

- npm test; npx tsc --noEmit; npm run lint; npm run build.
- scripts/tests/short-film-transaction.sql inside a rollback transaction after loading the migration checks idempotency, stale lease, completion, privileges and reviews. It must never persist QA fixtures or credit mutations.
- scripts/tests/short-film-media.mjs exercises actual FFmpeg: mixed silent/audio clips, 1080 portrait, Vietnamese SRT and final duration.
- Before enabling fixed voice: human approval of four samples, five-shot family canary, listening and visual continuity checks, playback/download after refresh. Build/tests do not substitute for this gate.

### 2026-09-08 production verification

- Two migrations applied to comicfanpage (`kpsmwylkmdrmbunzboua`), then rollback-only RPC tests passed, including insufficient funds, stale owner/epoch, idempotency, denied client quote writes and review receipts.
- 168 unit tests, TypeScript, ESLint and Next production build passed. Real container FFmpeg fixture produced 1080x1920 H.264/AAC with Vietnamese SRT, 2.437 s for a 2.4 s concatenation. This is a technical fixture, not a character-consistency canary.
- Four actual MiniMax samples completed through project reservations and Railway: Banh Bao/Lively_Girl 4.342 s; Dau Do/Decent_Boy 3.576 s; Mother/Calm_Woman 3.796 s; Father/Patient_Man 4.899 s. Four project points total, no sample approved automatically. Project points were funded by transferring four existing personal points through the normal wallet UI.
- Actual AI authoring initially failed: web request waited for Gemini and validator rejected six-second scenes. Authoring now returns 202 using Next after(), stores the result, validates all scenes without dropping invalid ones, and permits 4–30 s. A second actual authoring run produced and saved `Vu An Nhan Banh Bien Mat`: five scenes, four cast members, 30 seconds, plan `7b72706e-aae6-4351-b0ca-b01f2a1e9683`.
- Browser verified restored brief, four private audio results, correct zero project balance, 390/768/1024/1440 widths without document horizontal overflow. Manual visual checks exposed and fixed an undefined button colour utility and mobile menu/title overlap. Two themes checked. No full film playback or speaker/lip-sync quality conclusion follows from these checks.
- Outstanding release gate: the owner must listen to and approve four voices, then the five-shot paid film canary must pass actual identity, Vietnamese speech, lip-sync, subtitles, playback/download and restart checks. Fixed-voice generation remains disabled. Native single clips are unaffected.
- Operational limitation: ambiguous provider submission without prediction ID requires operator reconciliation; no automatic paid retry. Creative text runs use Next after() within the function deadline, not the media worker lease. Results can be recovered manually from the short-film screen after refresh; a terminated text function may still need an operator to settle its running record.
