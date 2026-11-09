import { EngineUnavailableError, type EngineCapabilities, type EngineRole, type GenerationEngine } from './types';

/**
 * Slots for real provider adapters (video with native audio, voice, lip-sync).
 * No provider has been chosen yet, so each slot reports itself unavailable and every
 * call fails loudly. When a provider is picked, its adapter fills in the HTTP calls and
 * declares the provider's documented capabilities here, not optimistic ones.
 */

export interface CloudSlotConfig {
  id: string;
  name: string;
  roles: EngineRole[];
  description: string;
  capabilities: EngineCapabilities;
}

const NONE: EngineCapabilities = {
  imageGeneration: false,
  videoGeneration: false,
  nativeAudio: false,
  speechSynthesis: false,
  lipSync: false,
  emotionControl: false,
  headMotionControl: false,
  multiSpeakerInOneShot: false,
  maxReferenceImages: 0,
  identityPreservation: 'none',
  startEndFrames: false,
  maxDurationSec: 0,
  aspectRatios: [],
  languages: [],
  producesPlaceholders: false,
};

export function createUnconfiguredSlot(cfg: CloudSlotConfig): GenerationEngine {
  const fail = async (): Promise<never> => {
    throw new EngineUnavailableError(cfg.id, `${cfg.name} is not configured yet. A provider adapter and API key are needed before it can run.`);
  };
  return {
    id: cfg.id,
    name: cfg.name,
    roles: cfg.roles,
    description: cfg.description,
    capabilities: cfg.capabilities,
    status: () => ({ available: false, reason: 'No provider or API key configured' }),
    generateCandidates: cfg.roles.includes('image') ? fail : undefined,
    generateShot: cfg.roles.includes('video') ? fail : undefined,
    synthesizeSpeech: cfg.roles.includes('voice') ? fail : undefined,
    lipSync: cfg.roles.includes('lipsync') ? fail : undefined,
  };
}

export function defaultCloudSlots(): GenerationEngine[] {
  return [
    createUnconfiguredSlot({
      id: 'cloud-video',
      name: 'Cloud video engine',
      roles: ['video', 'image'],
      description: 'Slot for a text/image-to-video provider. Capabilities are declared by the adapter once a provider is chosen.',
      capabilities: { ...NONE },
    }),
    createUnconfiguredSlot({
      id: 'cloud-voice',
      name: 'Cloud voice engine',
      roles: ['voice'],
      description: 'Slot for a text-to-speech provider that generates each character’s dialogue track.',
      capabilities: { ...NONE },
    }),
    createUnconfiguredSlot({
      id: 'cloud-lipsync',
      name: 'Cloud lip-sync engine',
      roles: ['lipsync'],
      description: 'Slot for a lip-sync / facial performance provider that syncs mouth, face and head to a voice track.',
      capabilities: { ...NONE },
    }),
  ];
}
