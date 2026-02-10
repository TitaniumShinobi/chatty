import { registryInstance } from '../ConstructRegistry.js';
import { IdentityDriftDetector } from '../IdentityDriftDetector.js';
import { IdentityEnforcementService } from '../IdentityEnforcementService.js';
import { MessageAttributionService } from '../MessageAttributionService.js';

export const driftDetectorInstance = new IdentityDriftDetector();
export const enforcementService = new IdentityEnforcementService({
  registry: registryInstance,
  driftDetector: driftDetectorInstance,
});
export const attributionService = new MessageAttributionService({ registry: registryInstance });

export default {
  registryInstance,
  driftDetectorInstance,
  enforcementService,
  attributionService,
};
