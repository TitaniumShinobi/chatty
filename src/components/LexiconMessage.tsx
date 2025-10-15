import lex from '../data/lexicon.json';

interface LexiconMessageProps {
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: number;
    metadata?: Record<string, any>;
  };
}

export function LexiconMessage({ message }: LexiconMessageProps) {
  // Enhanced content rendering with lexicon support
  const renderContent = (content: string) => {
    // Check if content contains lexicon tokens
    if (content.includes('⟂')) {
      // Parse lexicon tokens and render them
      return content.split(/(⟂\d+)/).map((part, index) => {
        if (part.startsWith('⟂')) {
          const tokenId = parseInt(part.slice(1));
          const tokenText = (lex as any).tokensInverse?.[tokenId] ?? `⟂${tokenId}`;
          return <span key={index} className="text-blue-400">{tokenText}</span>;
        }
        return part;
      });
    }
    return content;
  };

  const getMessageStyle = () => {
    switch (message.role) {
      case 'user':
        return "bg-app-orange-950 border-app-orange-800";
      case 'system':
        return "bg-red-900 border-red-800 text-red-100";
      default:
        return "bg-app-orange-900 border-app-orange-800";
    }
  };

  const getRoleIcon = () => {
    switch (message.role) {
      case 'user':
        return '👤';
      case 'system':
        return '⚠️';
      default:
        return '🤖';
    }
  };

  return (
    <div className={`rounded-lg border p-4 whitespace-pre-wrap leading-relaxed ${getMessageStyle()}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm opacity-70">{getRoleIcon()}</span>
        <div className="flex-1">
          {renderContent(message.content)}
          {message.metadata && (
            <div className="mt-2 text-xs opacity-60">
              {message.metadata.timestamp && (
                <span>{new Date(message.metadata.timestamp).toLocaleTimeString()}</span>
              )}
              {message.metadata.features && (
                <span className="ml-2">
                  Features: {message.metadata.features.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to create lexicon-enhanced messages
export function createLexiconMessage(
  content: string,
  role: 'user' | 'assistant' | 'system',
  metadata?: Record<string, any>
) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    content,
    role,
    timestamp: Date.now(),
    metadata
  };
}

// Helper function to add lexicon tokens to messages
export function addLexiconToken(content: string, tokenId: number): string {
  return `${content} ⟂${tokenId}`;
}
