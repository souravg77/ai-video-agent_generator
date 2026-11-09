import type { AspectRatio, CandidateCount, Emotion, GenerationRoute, PerformanceDirection, TakeMetadata } from '../types';

/**
 * A generation engine declares what it can actually do. NOVA plans every shot against
 * these declarations and reports any gap instead of pretending the work was done.
 */
export interface EngineCapabilities {
  imageGeneration: boolean;
  videoGeneration: boolean;
  /** Generates speech, sound and synchronised performance together with the video. */
  nativeAudio: boolean;
  speechSynthesis: boolean;
  lipSync: boolean;
  emotionControl: boolean;
  headMotionControl: boolean;
  /** Can perform more than one speaking character reliably in a single generation. */
  multiSpeakerInOneShot: boolean;
  maxReferenceImages: number;
  identityPreservation: 'none' | 'weak' | 'reference_guided' | 'trained_identity';
  startEndFrames: boolean;
  maxDurationSec: number;
  aspectRatios: AspectRatio[];
  languages: string[] | 'any';
  /** Output is a stand-in for workflow testing, never real footage or real images. */
  producesPlaceholders: boolean;
}

export type EngineRole = 'image' | 'video' | 'voice' | 'lipsync';

export interface EngineStatus { available: boolean; reason?: string }

export interface CandidateRequest {
  characterId: string;
  characterName: string;
  description: string;
  count: CandidateCount | 1;
  seed?: number;
  referenceImages?: string[];
}
export interface CandidateResult { imageUri: string; seed: number; prompt: string; isPlaceholder: boolean }

export interface ShotRequest {
  shotId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  durationSec: number;
  referenceImages: { characterId: string; referenceId: string; imageUri: string }[];
  startFrameUri?: string;
  endFrameUri?: string;
  dialogue: { lineId: string; characterId: string; text: string; language: string; performance: PerformanceDirection }[];
  audioUri?: string;
  seed?: number;
}

export interface TakeResult {
  videoUri: string | null;
  audioUri: string | null;
  isPlaceholder: boolean;
  route: GenerationRoute;
  metadata: TakeMetadata;
}

export interface SpeechRequest { lineId: string; characterId: string; voiceId: string; text: string; language: string; emotion: Emotion; performance: PerformanceDirection }
export interface SpeechResult { audioUri: string; durationSec: number; isPlaceholder: boolean; language: string }

export interface LipSyncRequest { shotId: string; videoUri: string; audioUri: string; characterId: string; lineId: string; performance: PerformanceDirection }

export type ProgressFn = (fraction: number, message: string) => void;

export interface GenerationEngine {
  id: string;
  name: string;
  roles: EngineRole[];
  capabilities: EngineCapabilities;
  description: string;
  status(): EngineStatus;
  generateCandidates?(req: CandidateRequest, onProgress?: ProgressFn): Promise<CandidateResult[]>;
  generateShot?(req: ShotRequest, onProgress?: ProgressFn): Promise<TakeResult>;
  synthesizeSpeech?(req: SpeechRequest, onProgress?: ProgressFn): Promise<SpeechResult>;
  lipSync?(req: LipSyncRequest, onProgress?: ProgressFn): Promise<TakeResult>;
}

export class EngineUnavailableError extends Error {
  constructor(public engineId: string, reason: string) {
    super(reason);
  }
}
