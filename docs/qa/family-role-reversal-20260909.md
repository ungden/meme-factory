# Family writing: reversed caregiving — 2026-09-09

This supersedes the editorial interpretation in `family-writing-20260909.md`. The user clarified that the channel's central comic premise is the reversal of familiar family responsibilities: tiny children organize and look after physically adult parents, while the adults delay, ask for things, and need reminders. The humorous contrast exists in the situation before any clever final line.

## Reference review

Four local files were reviewed, comprising three new files and one repeat. Exact-time AVFoundation frames were sampled at one-second intervals and visually inspected in contact sheets. Gemini analyzed the supplied video/audio and visible subtitles; Mandarin transcriptions in that analysis are machine-assisted, not an independently verified human transcript. Timing below is approximate. No views or retention data were available.

| File | Observation | Writing lesson |
| --- | --- | --- |
| `o8fqYJR8ESDn14tEMGF3FQsfBoILIgBpAxgcjA.mp4` (43.2 s) | Tiny children, toy car and microphone enact a serious grown-up interview. | Appearance and assumed social role create contrast; setup questions need not be jokes themselves. Do not transplant the interview sequence or its final line. |
| `o8f12rIiC1BS5W8iOQiFPI7tAxEIEwA2yqQuHA.mp4` (41.4 s) | Child and father discuss a large expected amount and a small offer; bravado and reactions carry the exchange. | Distinguish face-saving character speech from an author's factual mistake. Adapt only contrast to a different family situation; do not import marriage-price or violence jokes. |
| `okAyBEcqcEzgHRtI2OPfBFzjeDZnk8Q8lPqLig.mp4` (31.3 s) | Two independent vignettes: cakes offered to children (~0–19 s); choosing money during a visit (~20–31 s). | In the first, a child's concern for the parent's portion can explain hesitation. Do not invent a selfish hidden motive. The second can end with a warm explanation; do not join both into one episode. |
| `tiktok_chiemnhabaobao_7679291505185508615.mp4` (29.6 s) | Backpack-wearing children leaving for lessons must also arrange food for parents lounging in bed. | Primary channel example: parental care is reversed. Detailed requests, objections, nagging and relenting are ordinary behavior made funny by who performs it. This repeats earlier reference #6, not an additional independent source. |

The earlier interpretation overemphasized negotiation, traps, tactical victories and proving a consequence. Those can occur but are not the channel's governing formula. Parents' requests and children's weary responses should not be rewritten into a contract or clever punishment merely to supply a punchline.

Temporary analysis/frame evidence: `/tmp/aida-family-newrefs-20260909/`. Source files remain in the user's Downloads folder and are not bundled or published.

## Implementation

- Shared `family-dialogue-4` policy supplies the same world rule to idea suggestions, writing, dialogue editing, independent review and shot planning.
- New AI stories require a concrete `comicPremise`: ordinary expectation, reversed situation and visible contrast. Metadata alone does not establish quality; the reviewer must cite the actual dialogue/actions.
- Five review dimensions: contrast, motivation, development, ending and originality. Missing contrast evidence fails closed, including responses shaped like the previous four-field approval.
- Channel roles now reflect the children organizing/helping/reminding and parents sometimes needing care. Parent and child visual identities, gender, reference assets and selected voices are unchanged.
- Historic plans remain readable without the new premise fields. New story context retains premise metadata to help avoid repetitive responsibilities/reactions; the writer still sees at most 20 recent plans.
- Exact accepted dialogue and speaker IDs continue into shots. This change does not start media, alter provider contracts, or enable scheduling.

## Profile and evaluation

Production project `0eed3bc2-b0e9-499a-afc4-b4ac425b44d2`, workspace 1, received a new channel profile version 4. Old versions and saved scripts remain. The same four character IDs were verified after insert. The previous row was backed up locally before insertion.

Live text samples and deployment verification are recorded below after completion. Passing structured validation is not proof that every script will be funny; samples require editorial readback.

## Live text evaluations

- `d1a9f8ae-64cf-47ac-82a5-dd4c889a9a2e`: explicit idea about waking parents for work, 11 speaking turns plus reaction, 66 seconds for planning. The normal parent-child morning routine is visibly reversed. Operator caught one incorrect `em` addressed to mother; added explicit addressee/pronoun checks. Machine approval alone did not establish editorial acceptance.
- `95434a3a-7965-4cea-b2c4-42a607a8b05d`: blank idea with only the siblings selected, 8 speaking turns plus reaction, 74 seconds. No unselected parent speaker was invented. Operator found generic cleanup and overt explanation of the reversal too flat; tightened specificity, cheerful contrast and avoiding dialogue that states the channel positioning.

Neither sample was saved over an episode, marked user-approved, or sent to a media provider. Revision evaluation follows.

## Verification

201 tests pass. Tests cover legacy story compatibility, required premise in new AI drafts, missing contrast evidence, exact speaker/dialogue preservation, existing locked-scene behavior and bounded repair. TypeScript, ESLint, whitespace checks and the production Next build pass. No schema or dependency changes are required.
