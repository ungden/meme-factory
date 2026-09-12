import type {
  SegmentContinuityState,
  SegmentPropState,
} from "../film-storyboard";

export type FilmSegmentTimingSource = "planned" | "detected" | "manual";

export type FilmSegmentRevision = {
  id: string | null;
  segmentId: string;
  sceneId: string;
  sceneIndex: number;
  sequenceIndex: number;
  revision: number;
  planVersion: number;
  sceneVersion: number;
  speakerCharacterId: string | null;
  speakerName: string | null;
  voiceProfileVersion: string | null;
  dialogue: string;
  action: string;
  camera: string;
  motionPrompt: string;
  imagePrompt: string;
  openingState: SegmentContinuityState;
  closingState: SegmentContinuityState;
  props: SegmentPropState[];
  sourceTaskId: string | null;
  originalSourceTaskId: string | null;
  originalInSeconds: number;
  originalOutSeconds: number;
  inSeconds: number;
  outSeconds: number;
  timingSource: FilmSegmentTimingSource;
  timingEvidence: Record<string, unknown>;
  selectedTaskId: string | null;
  selectedInSeconds: number | null;
  selectedOutSeconds: number | null;
  selectedAt: string | null;
  attempts: FilmSegmentAttempt[];
};

export type FilmSegmentAttempt = {
  taskId: string;
  segmentRevision: number | null;
  status: string;
  points: number;
  duration: number | null;
  usedDuration: number | null;
  url?: string;
  createdAt: string;
  selected: boolean;
};

export type FilmSegmentPatch = Pick<
  FilmSegmentRevision,
  | "speakerCharacterId"
  | "voiceProfileVersion"
  | "dialogue"
  | "action"
  | "camera"
  | "motionPrompt"
  | "imagePrompt"
  | "openingState"
  | "closingState"
  | "props"
  | "sourceTaskId"
  | "inSeconds"
  | "outSeconds"
  | "timingSource"
  | "timingEvidence"
>;
