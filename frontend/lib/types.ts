export type EventType =
  | "status"
  | "simulator_progress"
  | "transcript_partial"
  | "transcript_final"
  | "notes_delta"
  | "live_notes_delta"
  | "final_notes"
  | "camera_preview"
  | "audio_segment"
  | "audio_frame"
  | "camera_frame"
  | "start_session"
  | "stop_session"
  | "error";

export interface EventEnvelope<TPayload = unknown> {
  type: EventType;
  sessionId: string;
  timestamp: number;
  payload: TPayload;
}

export interface StatusPayload {
  message: string;
}

export interface SimulatorProgressPayload {
  processedMs: number;
}

export interface ErrorPayload {
  message: string;
}

export interface TranscriptPartialPayload {
  lineId: string;
  text: string;
}

export interface TranscriptFinalPayload {
  lineId?: string;
  text: string;
  source?: string;
  segmentMs?: number;
}

export interface NotesTopicDelta {
  title: string;
  bullets?: string[];
}

export interface KeyTerm {
  term: string;
  weight: number;
}

export interface DefinitionItem {
  term: string;
  definition: string;
}

export interface NotesDeltaPayload {
  topics?: NotesTopicDelta[];
  keyTerms?: KeyTerm[];
  questions?: string[];
  definitions?: DefinitionItem[];
  steps?: string[];
}

export interface LiveNotesDefinition {
  term: string;
  def: string;
}

export interface LiveNotesPayload {
  nowTopic: string;
  keyPoints: string[];
  defs: LiveNotesDefinition[];
  missedCue: string;
}

export interface FinalNotesPayload {
  text: string;
}

export interface CameraPreviewPayload {
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface AudioSegmentPayload {
  sampleRate: number;
  format: "f32le";
  audio: string;
}

export interface AudioFramePayload {
  sampleRate: number;
  format: "f32le";
  audio: string;
}

export interface CameraFramePayload {
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface TranscriptLine {
  id: string;
  text: string;
}

export interface NotesTopic {
  title: string;
  bullets: string[];
}

export interface NotesState {
  topics: NotesTopic[];
  keyTerms: KeyTerm[];
  questions: string[];
  definitions: DefinitionItem[];
  steps: string[];
}
