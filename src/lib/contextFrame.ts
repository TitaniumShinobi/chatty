// Context frame provider for persona sharing between BaseChatty and GPTCreator
export type Persona = { name?: string; instructions?: string };

let activePersona: Persona | null = null;

export function setActivePersona(p: Persona | null) { 
  activePersona = p; 
}

export function getActivePersona() { 
  return activePersona; 
}

export function clearActivePersona() {
  activePersona = null;
}
