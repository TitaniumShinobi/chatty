import type { ConstructConfig, ConstructMetadata } from './constructs';

export interface IConstructRegistry {
  getConstruct(constructId: string): Promise<ConstructMetadata | null>;
  getAllConstructs(): Promise<ConstructConfig[]>;
}
