import { useState, useEffect, useCallback, useRef } from "react";

interface Suggestion {
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
  { text: "What are you working on?" },
  { text: "Debug or optimize something" },
  { text: "Learn something new together" },
  { text: "Focus on a specific goal" },
];

const FETCH_TIMEOUT_MS = 3000;

export function useDynamicSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(DEFAULT_SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/suggestions", {
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeout);

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
      clearTimeout(timeout);
      setSuggestions(DEFAULT_SUGGESTIONS);
      if (err instanceof DOMException && err.name === "AbortError") {
        console.warn("[useDynamicSuggestions] Fetch timed out, using defaults");
      } else {
        console.warn("[useDynamicSuggestions] Failed to fetch:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch suggestions");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchSuggestions]);

  return {
    suggestions,
    isLoading,
    error,
    refresh: fetchSuggestions,
  };
}
