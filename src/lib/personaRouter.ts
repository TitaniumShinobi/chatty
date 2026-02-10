export interface PersonaRoute {
  persona: string;
  crisis?: {
    code: string;
    reason: string;
  };
  intentTags: string[];
}

export function routePersona(options: {
  intentTags: string[];
  tone?: string;
  message: string;
}): PersonaRoute {
  return {
    persona: 'default',
    intentTags: options.intentTags,
    crisis: options.message.includes('help')
      ? { code: 'HELP_001', reason: 'Triggered by explicit help request' }
      : undefined
  };
}
