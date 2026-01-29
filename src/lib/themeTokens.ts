// Theme Token System for Chatty
// Centralized color management with semantic naming

export interface ThemeTokens {
  // Background Colors
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  
  // Interactive Colors
  interactivePrimary: string;
  interactiveSecondary: string;
  interactiveAccent: string;
  
  // Text Colors
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  
  // Status Colors
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;
  
  // Component-Specific
  messageUser: string;
  messageAI: string;
  messageSystem: string;
  borderSubtle: string;
}

export const lightTheme: ThemeTokens = {
  // Backgrounds - Light cream palette
  bgPrimary: '#fffff0',
  bgSecondary: '#ffffd7', 
  bgTertiary: '#ffffd7',
  
  // Interactive
  interactivePrimary: '#ADA587',
  interactiveSecondary: '#ffffd7',
  interactiveAccent: '#3A2E14',
  
  // Text
  textPrimary: '#3A2E14',
  textSecondary: '#3A2E14',
  textInverse: '#fffff0',
  
  // Status
  statusSuccess: '#22c55e',
  statusWarning: '#f59e0b', 
  statusError: '#dc2626',
  statusInfo: '#3b82f6',
  
  // Components
  messageUser: '#ADA587',
  messageAI: '#ffffd7',
  messageSystem: '#fffff0',
  borderSubtle: 'rgba(76, 61, 30, 0.18)',
};

export const nightTheme: ThemeTokens = {
  // Backgrounds - Outer Space palette
  bgPrimary: '#000110',
  bgSecondary: '#1A1C2B',
  bgTertiary: '#1A1C2B',
  
  // Interactive
  interactivePrimary: '#ADA587',
  interactiveSecondary: '#1A1C2B',
  interactiveAccent: '#ADA587',
  
  // Text - Cloud lemon only, hierarchy via opacity
  textPrimary: '#fffff0',
  textSecondary: '#fffff0',
  textInverse: '#000110',
  
  // Status
  statusSuccess: '#22c55e',
  statusWarning: '#f59e0b',
  statusError: '#dc2626', 
  statusInfo: '#3b82f6',
  
  // Components
  messageUser: '#ADA587',
  messageAI: '#1A1C2B',
  messageSystem: '#1A1C2B',
  borderSubtle: 'rgba(255, 255, 240, 0.18)',
};

// User-defined theme support
export interface CustomTheme extends Partial<ThemeTokens> {
  name: string;
  description?: string;
}

export const applyThemeTokens = (tokens: ThemeTokens) => {
  const root = document.documentElement;
  
  // Apply all tokens as CSS custom properties
  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(`--chatty-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
  });
};

// Theme validation
export const validateTheme = (theme: Partial<ThemeTokens>): boolean => {
  const requiredKeys: (keyof ThemeTokens)[] = [
    'bgPrimary', 'bgSecondary', 'interactivePrimary', 'textPrimary'
  ];
  
  return requiredKeys.every(key => theme[key] && typeof theme[key] === 'string');
};
