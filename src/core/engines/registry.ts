import { defaultCloudSlots } from './cloudAdapters';
import { createPlaceholderEngine } from './placeholderEngine';
import type { EngineRole, GenerationEngine } from './types';

export class EngineRegistry {
  private engines = new Map<string, GenerationEngine>();

  constructor(engines: GenerationEngine[] = []) {
    engines.forEach((e) => this.register(e));
  }

  register(engine: GenerationEngine): void {
    this.engines.set(engine.id, engine);
  }

  get(id: string | null | undefined): GenerationEngine | undefined {
    return id ? this.engines.get(id) : undefined;
  }

  all(): GenerationEngine[] {
    return [...this.engines.values()];
  }

  forRole(role: EngineRole): GenerationEngine[] {
    return this.all().filter((e) => e.roles.includes(role));
  }
}

export function createDefaultRegistry(opts: { placeholderDelayMs?: number } = {}): EngineRegistry {
  return new EngineRegistry([createPlaceholderEngine({ delayMs: opts.placeholderDelayMs }), ...defaultCloudSlots()]);
}
