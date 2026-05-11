// Attachment type for persisted file metadata
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  thumbnailUrl?: string;
  role: 'image' | 'document' | 'other';
  // For in-flight attachments (not yet uploaded)
  data?: string; // base64 data
  file?: File; // original file object
}

export interface PacketCitation {
  index?: number;
  title?: string;
  label?: string;
  url?: string;
  source?: string;
  snippet?: string;
}

export interface AnswerPacketPayload {
  content: string;
  citations?: PacketCitation[];
}

export interface HousingResultImage {
  url: string;
  alt?: string;
}

export interface HousingResultCard {
  id?: string;
  title?: string;
  address?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  price?: number | string;
  currency?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  sqft?: number | string;
  propertyType?: string;
  status?: string;
  source?: string;
  broker?: string;
  url?: string;
  listingUrl?: string;
  sourceUrl?: string;
  description?: string;
  tags?: string[];
  images?: Array<HousingResultImage | string>;
  photos?: Array<HousingResultImage | string>;
  citationIndex?: number;
  citationIndices?: number[];
}

export interface HousingResultsPacketPayload {
  query?: string;
  region?: string;
  total?: number;
  results: HousingResultCard[];
  citations?: PacketCitation[];
}

// Enforce packet-only for assistant messages
export type Op =
  | "answer.v1"
  | "housing.results.v1"
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
  | { op: "answer.v1"; payload: AnswerPacketPayload }
  | { op: "housing.results.v1"; payload: HousingResultsPacketPayload }
  | { op: "file.summary.v1"; payload: { fileName: string; summary: string; fileCount: number } }
  | { op: "warn.v1"; payload: { message: string; severity?: 'low' | 'medium' | 'high' } }
  | { op: "error.v1"; payload: { message: string; code?: string } }
  | { op: "thought.v1"; payload: { notes: string[] } }
  | { op: "evidence.v1"; payload: { items: string[] } }
  | { op: "plan.v1"; payload: { steps: string[] } }
  | { op: "web.evidence.v1"; payload: { engine: string; results: unknown[] } }
  | { op: "story.v1"; payload: { title: string; content: string } }
  | { op: "insight.v1"; payload: { note: string } };

// ------------------------------------------------------------------
// legacy message shapes remain below (may be phased out later)

export type UserMsg = { 
  id: string;
  role: 'user'; 
  content: string;
  timestamp: string;
  files?: File[];
  attachments?: Attachment[];
};

export type AssistantMsg = { 
  id: string;
  role: 'assistant'; 
  content: AssistantPacket[]; // Strictly packets only, no union with string
  timestamp: string;
  files?: File[];
  attachments?: Attachment[];
};

export type SystemMsg = { 
  id: string;
  role: 'system'; 
  content: string;
  timestamp: string;
  files?: File[];
  attachments?: Attachment[];
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
  constructId?: string
}

export interface SidebarProps {
  conversations: Conversation[]
  threads: unknown[]
  currentConversationId: string | null
  hasCreatedCustomAI?: boolean
  hasAddressBookLoadError?: boolean
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
  onNewConversationWithGPT: (gptId: string) => void
  onDeleteConversation: (id: string) => void
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void
  onShowGPTCreator: () => void
  onShowGPTs: () => void
  onOpenExplore?: () => void
  onOpenCodex?: () => void
  onOpenLibrary?: () => void
  onOpenSearch?: () => void
  onOpenProjects?: () => void
  onShowRuntimeDashboard?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  currentUser?: unknown
  onLogout?: () => void
  onShowSettings?: () => void
  hasBlockingOverlay?: boolean
  isVVAULTConnected?: boolean
}

export interface MessageProps {
  message: Message
  isLast: boolean
  sessionStartMs?: number
  latestAssistantMessageId?: string | null
  /** When set, TTS uses Zen/Lin voice from settings when thread is Zen/Lin. */
  threadId?: string | null
  /** Called after TTS playback succeeds so the message can be marked as spoken (voice badge). */
  onMarkSpoken?: (messageId: string, metadata: { outputMode: 'voice'; speechText?: string; voiceReply: true }) => void
}

export interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}
