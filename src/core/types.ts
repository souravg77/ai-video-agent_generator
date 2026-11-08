// Core domain model for NOVA FLOW. Everything here is plain serialisable data so a
// project can be saved as JSON and reopened on any machine.

export type ProductionType = 'film' | 'advertisement' | 'short_film' | 'documentary' | 'music_video' | 'custom';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2.39:1' | '4:3';
export type Resolution = '720p' | '1080p' | '4k';
export type CandidateCount = 4 | 6 | 8;
export type HardwareProfile = 'cloud' | 'local_gpu' | 'local_cpu';

export interface ProjectSettings {
  productionType: ProductionType;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: 24 | 25 | 30;
  language: string; // BCP-47, e.g. "en-US"
  targetDurationSec: number;
  candidateCount: CandidateCount;
  hardwareProfile: HardwareProfile;
}

// ---------------------------------------------------------------------------
// Performance direction: every spoken line is a character performance.
// ---------------------------------------------------------------------------

export const EMOTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'afraid', 'surprised', 'confident', 'nervous', 'romantic', 'sarcastic', 'custom',
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Intensity = 'subtle' | 'moderate' | 'strong';
export type SpeakingSpeed = 'slow' | 'normal' | 'fast';
export type PerformanceState = 'speaking' | 'listening' | 'reacting' | 'silent';

export interface PerformanceDirection {
  emotion: Emotion;
  customEmotion?: string;
  intensity: Intensity;
  speed: SpeakingSpeed;
  pauses: string;
  emphasis: string[];
  vocalDelivery: string;
  pronunciation: string;
  expressionBefore: string;
  expressionDuring: string;
  expressionAfter: string;
  eyeDirection: string;
  headMovement: string;
  posture: string;
  gesture: string;
  /** True while the values are machine-inferred and the director has not reviewed them. */
  inferred: boolean;
}

export interface CharacterPresence {
  characterId: string;
  state: PerformanceState;
  direction: string;
}

export interface DialogueLine {
  id: string;
  sceneId: string;
  order: number;
  speakerId: string;
  listenerIds: string[];
  text: string;
  parenthetical?: string;
  extension?: string; // V.O., O.S., CONT'D
  isVoiceOver: boolean;
  performance: PerformanceDirection;
  /** What every other character in the scene is doing during this line. */
  others: CharacterPresence[];
}

export type ScriptElement =
  | { kind: 'action'; text: string }
  | { kind: 'dialogue'; lineId: string }
  | { kind: 'beat'; characterId: string; text: string; state: PerformanceState; direction: string }
  | { kind: 'transition'; text: string };

export interface Scene {
  id: string;
  number: number;
  heading: string;
  setting: 'INT' | 'EXT' | 'INT/EXT' | null;
  locationId: string | null;
  timeOfDay: string;
  elements: ScriptElement[];
  characterIds: string[];
  propIds: string[];
}

export interface Location { id: string; name: string; description: string }
export interface Prop { id: string; name: string; description: string }

export interface ScriptDocument {
  id: string;
  title: string;
  source: string;
  parsedAt?: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Characters and identity
// ---------------------------------------------------------------------------

export interface CharacterCandidate {
  id: string;
  imageUri: string;
  source: 'generated' | 'uploaded';
  engineId: string | null;
  /** Placeholder images come from the offline engine and are not real generations. */
  isPlaceholder: boolean;
  prompt: string;
  seed: number;
  batch: number;
  createdAt: string;
  rejected: boolean;
}

export interface ReferenceViews { front?: string; side?: string; threeQuarter?: string; fullBody?: string }

/** The approved look of a character. A reference guides generation; it is not a trained model. */
export interface ApprovedReference {
  referenceId: string;
  candidateId: string;
  imageUri: string;
  isPlaceholder: boolean;
  views: ReferenceViews;
  version: number;
  approvedAt: string;
}

export interface CharacterVersionEntry {
  version: number;
  at: string;
  action: 'created' | 'candidates_generated' | 'reference_uploaded' | 'approved' | 'locked' | 'unlocked' | 'profile_edited';
  note: string;
  referenceId?: string;
}

export interface VoiceProfile {
  voiceId: string;
  engineId: string | null;
  language: string;
  accent: string;
  speakingStyle: string;
  pronunciationNotes: string;
  emotionalRange: Emotion[];
}

export interface Character {
  id: string;
  name: string;
  appearance: {
    age: string; hair: string; skin: string; face: string; build: string; wardrobe: string; accessories: string; notes: string;
  };
  voice: VoiceProfile;
  mannerisms: string;
  wardrobeByScene: Record<string, string>;
  expressionRefs: Partial<Record<Emotion, string>>;
  candidates: CharacterCandidate[];
  approved: ApprovedReference | null;
  /** Earlier approvals are kept so shots pinned to them stay reproducible. */
  previousApprovals: ApprovedReference[];
  locked: boolean;
  history: CharacterVersionEntry[];
  inScript: boolean;
  /** Identity training (e.g. LoRA) is a separate pipeline; not available in this build. */
  identityTraining: { status: 'none' };
}

// ---------------------------------------------------------------------------
// Shots, takes and validation
// ---------------------------------------------------------------------------

export type Framing = 'EWS' | 'WS' | 'MWS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'OTS' | 'TWO';
export interface CameraPlan { framing: Framing; angle: string; movement: string; lensMm: number }

export interface CharacterRefPin { characterId: string; referenceId: string; version: number }

export type FrameRef =
  | { kind: 'character'; characterId: string; referenceId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'take'; shotId: string; takeId: string; position: 'last' };

export type CheckStatus = 'pass' | 'fail' | 'not_checked';
export type LipSyncCheckId =
  | 'real_footage'
  | 'correct_speaker'
  | 'mouth_audio_alignment'
  | 'no_off_turn_mouth_movement'
  | 'emotion_consistency'
  | 'blink_breathing'
  | 'no_frozen_face'
  | 'av_drift'
  | 'language_pronunciation';

export interface ValidationCheck {
  id: LipSyncCheckId;
  label: string;
  status: CheckStatus;
  detail: string;
  source: 'metadata' | 'analyzer' | 'manual' | 'none';
}

export interface ValidationReport {
  takeId: string;
  createdAt: string;
  checks: ValidationCheck[];
  overall: 'pass' | 'fail' | 'incomplete';
}

export type GenerationRoute = 'native_av' | 'separate_performance' | 'video_only';

export interface SpeakerTrack { characterId: string; lineId: string; startSec: number; endSec: number; language: string }

export interface TakeMetadata {
  videoDurationSec?: number;
  audioDurationSec?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Which character the engine says it animated for each line. */
  speakerTracks?: SpeakerTrack[];
  referenceIdsUsed?: string[];
}

export interface Take {
  id: string;
  shotId: string;
  createdAt: string;
  engineId: string;
  route: GenerationRoute;
  videoUri: string | null;
  audioUri: string | null;
  isPlaceholder: boolean;
  metadata: TakeMetadata;
  validation: ValidationReport | null;
  notes: string;
}

export interface Shot {
  id: string;
  sceneId: string;
  order: number;
  title: string;
  description: string;
  dialogueLineIds: string[];
  characterIds: string[];
  camera: CameraPlan;
  lighting: string;
  motion: string;
  durationSec: number;
  startFrame: FrameRef | null;
  endFrame: FrameRef | null;
  characterRefs: CharacterRefPin[];
  takes: Take[];
  approvedTakeId: string | null;
  orphaned: boolean;
}

export type ShotStatus = 'not_started' | 'generated_unvalidated' | 'needs_repair' | 'ready_to_approve' | 'approved';

// ---------------------------------------------------------------------------
// Library assets, timeline and project
// ---------------------------------------------------------------------------

export interface ReferenceAsset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  uri: string;
  tags: string[];
  addedAt: string;
}

export type TrackKind = 'music' | 'sfx' | 'voiceover';
export interface AudioClip { id: string; track: TrackKind; name: string; uri: string | null; startSec: number; durationSec: number }

export interface ProjectVersion { id: string; label: string; at: string; snapshot: string }

export interface Project {
  schema: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  script: ScriptDocument;
  scenes: Scene[];
  dialogue: DialogueLine[];
  characters: Character[];
  locations: Location[];
  props: Prop[];
  assets: ReferenceAsset[];
  shots: Shot[];
  audioClips: AudioClip[];
  engineSelection: { video: string | null; image: string | null; voice: string | null; lipsync: string | null };
  versions: ProjectVersion[];
}
