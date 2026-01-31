import { useState, useEffect, useCallback } from "react";

interface Suggestion {
  emoji: string;
  text: string;
}

interface SuggestionsResponse {
  ok: boolean;
  suggestions: Suggestion[];
  context?: {
    period: string;
    isWeekend: boolean;
    hasHistory: boolean;
    fallback?: boolean;
  };
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { emoji: "🌤️", text: "What are you working on?" },
  { emoji: "🔧", text: "Debug or optimize something" },
  { emoji: "📚", text: "Learn something new together" },
  { emoji: "🎯", text: "Focus on a specific goal" },
];

export function useDynamicSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(DEFAULT_SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/suggestions", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch suggestions: ${response.status}`);
      }

      const data: SuggestionsResponse = await response.json();

      if (data.ok && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      } else {
        setSuggestions(DEFAULT_SUGGESTIONS);
      }
    } catch (err) {
      console.warn("[useDynamicSuggestions] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch suggestions");
      setSuggestions(DEFAULT_SUGGESTIONS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return {
    suggestions,
    isLoading,
    error,
    refresh: fetchSuggestions,
  };
}
