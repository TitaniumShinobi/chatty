// Slash Command Input Component
// Provides CLI-style command interface for web

import React, { useState, useRef } from 'react';
import { cliBridge, type CommandResult } from '../lib/cliBridge';

interface CommandInputProps {
  onCommandResult: (result: CommandResult) => void;
  onMessage: (message: string) => void;
  disabled?: boolean;
}

const COMMAND_SUGGESTIONS = [
  '/model',
  '/model list',
  '/model synth',
  '/model phi3:latest',
  '/model deepseek-coder:latest',
  '/model mistral:latest',
  '/ts',
  '/status',
  '/clear',
  '/help'
];

export function CommandInput({ onCommandResult, onMessage, disabled = false }: CommandInputProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    if (value.startsWith('/')) {
      const filtered = COMMAND_SUGGESTIONS.filter(cmd => 
        cmd.toLowerCase().startsWith(value.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    setSelectedSuggestion(-1);
  };

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      const scrollHeight = inputRef.current.scrollHeight
      const maxHeight = 15 * 24 // 15 lines * 24px line height
      inputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Enter key for sending messages (not just suggestions)
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showSuggestions && selectedSuggestion >= 0) {
        e.preventDefault();
        setInput(suggestions[selectedSuggestion]);
        setShowSuggestions(false);
        return;
      }
      // If no suggestions or not selecting, submit the form
      e.preventDefault();
      handleSubmit(e);
      return;
    }

    // Handle suggestion navigation only when suggestions are shown
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;

    const message = input.trim();
    setInput('');
    setShowSuggestions(false);
    setSelectedSuggestion(-1);

    try {
      if (message.startsWith('/')) {
        // Handle slash command
        const result = await cliBridge.sendCommand(message);
        onCommandResult(result);
      } else {
        // Handle regular message
        onMessage(message);
      }
    } catch (error: any) {
      onCommandResult({
        type: 'error',
        content: `Error: ${error.message}`,
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (input.startsWith('/') && suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            onBlur={() => {
              // Delay hiding suggestions to allow clicks
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder={input.startsWith('/') ? "Type a command..." : "Message Chatty..."}
            disabled={disabled}
            className="w-full px-4 py-3 bg-app-orange-700 border border-app-orange-600 rounded-lg text-white placeholder-app-orange-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[48px] max-h-32"
            rows={1}
          />
          
          {/* Command suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-app-orange-800 border border-app-orange-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-app-orange-700 ${
                    index === selectedSuggestion ? 'bg-app-orange-700' : ''
                  } ${index === 0 ? 'rounded-t-lg' : ''} ${
                    index === suggestions.length - 1 ? 'rounded-b-lg' : ''
                  }`}
                >
                  <span className="text-blue-400">{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={!input.trim() || disabled}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-app-orange-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {input.startsWith('/') ? 'Run' : 'Send'}
        </button>
      </form>
      
      {/* Command help hint */}
      {input.startsWith('/') && (
        <div className="mt-2 text-xs text-app-orange-400">
          💡 Type <span className="text-blue-400">/help</span> for available commands
        </div>
      )}
    </div>
  );
}
