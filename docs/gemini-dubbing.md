# Vietnamese dubbing

New short films use `audio_mode=dubbed`. Existing native/fixed revisions and already accepted jobs remain readable. Opening a native script selects dubbing in the editor; generating or quoting first saves a new revision. Scheduling a native revision is rejected until it is saved in the new mode.

Each storyboard utterance has its own approved character voice version, exact text, TTS task and measured duration. The video quote freezes these task IDs and timings; a replacement TTS attempt invalidates dependent video/dub/transcript selection. If measured speech does not fit its beat, stop before buying video. There is no automatic time stretch, sentence truncation or paid retry.

Seedance I2V receives a clean first frame, a timed 15-second acting prompt and `generate_audio=false`. A local `dub` task validates speaker, voice version, text, scene revision and measured file duration, then uses FFmpeg to map only source video plus delayed Gemini audio. Native sound is discarded. The output remains pending audiovisual review; mixing does not prove lip sync. Whisper transcribes the resulting dubbed audio for film subtitles. Render uses that exact dubbed clip and transcript.

The standalone clip tool supports one selected character voice/narration. Its server quote includes TTS and freezes the approved voice; AI assistance now retains dialogue/speaker instead of discarding them. Both text/image Seedance modes request silent video. Railway stores the original clip, recovers TTS audio/checkpoints, then mixes it. Unknown TTS submissions never get blindly repeated. An audio clip longer than the video stops for review with both sources retained. Vercel fallback reconciliation excludes this workflow so it cannot publish the silent source as finished.

Music is not recovered from the old mixed Seedance soundtrack. No voice cloning or automatic music generation is added. Dubbing is not a guarantee of lip synchronization; use audiovisual review, with the existing one-speaker Sync branch remaining experimental.

Validation: unit tests for routing/version dependencies/timing; FFmpeg fixture for mapped audio and unchanged dimensions/duration; standalone recovery tests for upload interruption, persisted audio, duplicate completion and lost lease; transactional Postgres storyboard save/version/permissions test. These are not a paid character-video canary.
