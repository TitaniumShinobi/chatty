// Enforce packet-only for assistant messages
export type Op =
  | "greet.v1"
  | "ask.clarify.v1"
  | "answer.v1"
  | "smalltalk.welcome.v1"
  | "ack.file.v1"
  | "fallback.v1";

export type AssistantPacket =
  | { op: "greet.v1"; payload: { userName?: string } }
  | { op: "ask.clarify.v1"; payload: { topic?: string } }
  | { op: "answer.v1"; payload: string[] | { contentKeys: string[] } }
  | { op: "smalltalk.welcome.v1"; payload: {} }
  | { op: "ack.file.v1"; payload: { count: number } }
  | { op: "fallback.v1"; payload: { echo?: string } };

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
  content: AssistantPacket; // Strictly packet only, no union with string
  timestamp: string;
  files?: File[];
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
}

export interface ChatAreaProps {
  conversation: Conversation | undefined
  activeGPTName?: string
  onSendMessage: (message: Message) => void
  onNewConversation: () => void
  onToggleSidebar: () => void
}

export interface SidebarProps {
  conversations: Conversation[]
  currentConversationId: string | null
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
  onNewConversationWithGPT: (gptId: string) => void
  onDeleteConversation: (id: string) => void
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void
  onShowGPTCreator: () => void
  onShowGPTs: () => void
  currentUser?: any
  onLogout?: () => void
  onShowSettings?: () => void
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
