// Enforce packet-only for assistant messages
export type Op =
  | "answer.v1"
  | "file.summary.v1"
  | "warn.v1"
  | "error.v1"
  | "thought.v1"
  | "evidence.v1"
  | "plan.v1"
  | "web.evidence.v1"
  | "story.v1"
  | "insight.v1";

export type AssistantPacket =
  | { op: "answer.v1"; payload: { content: string } }
  | { op: "file.summary.v1"; payload: { fileName: string; summary: string; fileCount: number } }
  | { op: "warn.v1"; payload: { message: string; severity?: 'low' | 'medium' | 'high' } }
  | { op: "error.v1"; payload: { message: string; code?: string } }
  | { op: "thought.v1"; payload: { notes: string[] } }
  | { op: "evidence.v1"; payload: { items: string[] } }
  | { op: "plan.v1"; payload: { steps: string[] } }
  | { op: "web.evidence.v1"; payload: { engine: string; results: any[] } }
  | { op: "story.v1"; payload: { title: string; content: string } }
  | { op: "insight.v1"; payload: { note: string } };

// Snapshot of client UI state that can be shared with prompt builders
export interface UIContextSnapshot {
  route?: string;
  activeThreadId?: string | null;
  sidebar?: {
    collapsed?: boolean;
  };
  modals?: {
    searchOpen?: boolean;
    projectsOpen?: boolean;
    settingsOpen?: boolean;
    shareOpen?: boolean;
  };
  composer?: {
    attachments?: number;
    optionsOpen?: boolean;
    isFocused?: boolean;
    inputLength?: number;
  };
  featureFlags?: Record<string, boolean>;
  theme?: string;
  activePanel?: string | null;
  synthMode?: 'synth' | 'lin';
  additionalNotes?: string[];
}

// ------------------------------------------------------------------
// legacy message shapes remain below (may be phased out later)

export type UserMsg = { 
  id: string;
  role: 'user'; 
  content: string;
  timestamp: string;
  files?: File[];
};

export type AssistantMsg = { 
  id: string;
  role: 'assistant'; 
  content: AssistantPacket[]; // Strictly packets only, no union with string
  timestamp: string;
  files?: File[];
  metadata?: {
    responseTimeMs?: number;
    thinkingLog?: string[];
  };
};

export type SystemMsg = { 
  id: string;
  role: 'system'; 
  content: string;
  timestamp: string;
  files?: File[];
};

export type Message = UserMsg | AssistantMsg | SystemMsg;

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
  archived?: boolean
  isCanonical?: boolean
  canonicalForRuntime?: string
  constructId?: string | null
  runtimeId?: string | null
  isPrimary?: boolean
  importMetadata?: any
}

export interface SidebarProps {
  conversations?: Conversation[]
  threads?: Conversation[]
  currentConversationId: string | null
  onConversationSelect: (id: string) => void
  onNewConversation: (options?: { title?: string; starter?: string; files?: File[] }) => unknown
  onNewConversationWithGPT: (gptId: string) => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onArchiveConversation: (id: string, archive?: boolean) => void
  onShareConversation: (id: string) => void
  onOpenSearch?: () => void
  onOpenProjects?: () => void
  onShowGPTCreator: () => void
  onShowGPTs: () => void
  currentUser?: any
  onLogout?: () => void
  onShowSettings?: () => void
  onShowRuntimeDashboard?: () => void
}

export interface MessageProps {
  message: Message
  isLast: boolean
}

export interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}
