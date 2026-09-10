import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dubArguments, lockedTranscriptSegments, transcriptMatchesClip, validateDubCue } from '../short-film/dubbing.mjs';
import { ffmpeg, probe } from '../short-film/media.mjs';
const cue = { startSeconds: 0, endSeconds: 2, duration: 0.5, beatIndex: 0, speakerCharacterId: 'bao', voiceProfileVersion: 'v1', voice: 'Aoede', dialogue: 'Đi thôi' };
const video = { project_id: 'p', scene_id: 's', scene_version: 2 };
const audio = { ...video, kind: 'tts', status: 'completed', input: { ...cue, providerInputs: { text: cue.dialogue, voice: 'Aoede' } } };
test('reject wrong voice, text, project, duration and overlapping cues', () => {
  validateDubCue(cue, audio, video, 0.5);
  assert.throws(() => validateDubCue(cue, { ...audio, input: { ...audio.input, voiceProfileVersion: 'wrong' } }, video, 0.5));
  assert.throws(() => validateDubCue(cue, { ...audio, project_id: 'other' }, video, 0.5));
  assert.throws(() => validateDubCue(cue, audio, video, 3));
  assert.throws(() => dubArguments('v', ['a','b'], [cue, { ...cue, startSeconds: 0.2 }], 3, 'out'));
});
test('accepts measured speech that exactly fills its frozen schedule window', () => {
  const exact = { ...cue, endSeconds: 4.38, duration: 4.28 };
  const exactAudio = {
    ...video,
    kind: 'tts',
    status: 'completed',
    input: {
      ...exact,
      providerInputs: { text: exact.dialogue, voice: exact.voice },
    },
  };
  validateDubCue(exact, exactAudio, video, 4.28);
  assert.doesNotThrow(() => dubArguments('v', ['a'], [exact], 5, 'out'));
});
test('uses the same transcript threshold as dubbed QA without weakening native audio', () => {
  const transcript = {
    input: { videoTaskId: 'dub', audioMode: 'dubbed' },
    result: { speechError: 0.24 },
  };
  assert.equal(transcriptMatchesClip(transcript, 'dub'), true);
  assert.equal(
    transcriptMatchesClip(
      { ...transcript, input: { videoTaskId: 'dub', audioMode: 'native' } },
      'dub',
    ),
    false,
  );
  assert.equal(transcriptMatchesClip(transcript, 'other'), false);
});
test('builds subtitle text from the locked TTS schedule, not ASR homophones', () => {
  assert.deepEqual(
    lockedTranscriptSegments([
      { startSeconds: 0, duration: 1.25, dialogue: 'Con đếm đến ba.' },
      { startSeconds: 2, duration: 0.8, dialogue: 'Dạ.' },
    ]),
    [
      { start: 0, end: 1.25, text: 'Con đếm đến ba.' },
      { start: 2, end: 2.8, text: 'Dạ.' },
    ],
  );
  assert.equal(lockedTranscriptSegments([{ startSeconds: 0, duration: 0, dialogue: '' }]), null);
});
test('actual FFmpeg preserves video length and removes original audio mapping', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aida-dub-qa-'));
  try {
    const v = path.join(dir,'video.mp4'), a = path.join(dir,'a.wav'), b = path.join(dir,'b.wav'), out = path.join(dir,'out.mp4');
    await ffmpeg(['-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=3','-f','lavfi','-i','sine=frequency=150:duration=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',v]);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=440:duration=0.5',a]);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=880:duration=0.5',b]);
    const args = dubArguments(v,[a,b],[cue,{ ...cue,startSeconds: 2,endSeconds: 3 }],3,out);
    assert.deepEqual(args.filter((x,i) => args[i-1] === '-map'), ['0:v:0','[dub]']);
    await ffmpeg(args); const p = await probe(out);
    assert.ok(p.audio && p.video); assert.equal(p.width,320); assert.ok(Math.abs(p.duration-3)<0.1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('standalone dub resumes saved audio and refuses a second TTS after an uncertain upload', async () => {
  const { dubStandaloneClip } = await import('../short-film/clip-dubbing.mjs');
  const { copyFile, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(tmpdir(), 'aida-dub-restart-'));
  try {
    const video = path.join(dir,'source.mp4'), wav = path.join(dir,'fixture.wav');
    await ffmpeg(['-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=2','-c:v','libx264','-pix_fmt','yuv420p',video]);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=440:duration=0.5',wav]);
    const job = { checkpoint: { dubbing: { voice:'Aoede',model:'gemini-2.5-pro-preview-tts',text:'Đi thôi',voiceProfileVersion:'v1' } } };
    let calls=0, failVoice=true;
    const opts = { job,sourceUrl:video,apiKey:'test',
      save:async(patch)=>{ job.checkpoint={...job.checkpoint,...patch}; },
      persist:async(file,name)=>{ if(name==='voice.wav' && failVoice) throw new Error('UPLOAD_INTERRUPTED'); const dest=path.join(dir,'stored-'+name); await copyFile(file,dest); return {storagePath:dest}; },
      sign:async(p)=>p,downloadMedia:async(from,to)=>{await copyFile(from,to);},
      createSpeech:async()=>{calls++;return {audio:await readFile(wav),interactionId:null};},
    };
    await assert.rejects(()=>dubStandaloneClip(opts),/UPLOAD_INTERRUPTED/);
    failVoice=false;
    await assert.rejects(()=>dubStandaloneClip(opts),/RECONCILING/);
    assert.equal(calls,1);
    job.checkpoint.dubAudioPath=wav; // Operator/recovery found the already-created audio.
    const result=await dubStandaloneClip(opts);
    assert.ok(result.hasAudio); assert.equal(calls,1);
    assert.deepEqual(await dubStandaloneClip(opts),result); assert.equal(calls,1);
    const fresh={checkpoint:{dubbing:job.checkpoint.dubbing}};
    await assert.rejects(()=>dubStandaloneClip({...opts,job:fresh,save:async()=>{throw new Error('LOST_LEASE');}}),/LOST_LEASE/);
    assert.equal(calls,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
