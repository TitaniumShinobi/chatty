export { BaseConnector, CONNECTOR_METADATA } from './BaseConnector';
export type { ConnectorConfig, Character, SyncResult, ConnectorType } from './BaseConnector';
export { ConvaiConnector } from './ConvaiConnector';

import { ConnectorConfig, ConnectorType } from './BaseConnector';
import { ConvaiConnector } from './ConvaiConnector';

export function createConnector(type: ConnectorType, config: ConnectorConfig) {
  switch (type) {
    case 'convai':
      return new ConvaiConnector(config);
    case 'inworld':
      throw new Error('Inworld connector not yet implemented');
    case 'gemini':
      throw new Error('Gemini connector not yet implemented');
    default:
      throw new Error(`Unknown connector type: ${type}`);
  }
}
