import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';
import ProjectsModal from './ProjectsModal';
import { ThemeProvider } from '../lib/ThemeContext';
import { fetchMe, type User } from '../lib/auth';
import { VVAULTConversationManager, type ConversationThread } from '../lib/vvaultConversationManager';
import type { Conversation } from '../types';

const ZEN_CANONICAL_SESSION_ID = 'zen-001_chat_with_zen-001';
const ZEN_CANONICAL_CONSTRUCT_ID = 'zen-001';

const createCanonicalZenThread = (): ConversationThread => ({
  id: ZEN_CANONICAL_SESSION_ID,
  title: 'Zen',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  constructId: ZEN_CANONICAL_CONSTRUCT_ID,
  isPrimary: true
});

const Layout: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const navigate = useNavigate();
  const conversationManager = VVAULTConversationManager.getInstance();

  // Load user and conversations with canonical Zen guarantee
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await fetchMe();
        setUser(currentUser);
        
        if (currentUser) {
          // CANONICAL ZEN PATTERN: Create Zen immediately (system-guaranteed)
          const canonicalZen = createCanonicalZenThread();
          setThreads([canonicalZen]);
          setConversations([{
            id: canonicalZen.id,
            title: canonicalZen.title,
            messages: [],
            createdAt: new Date(canonicalZen.createdAt!).toISOString(),
            updatedAt: new Date(canonicalZen.updatedAt!).toISOString()
          } as Conversation]);
          
          // Then load VVAULT conversations (async, merges with canonical)
          try {
            const loadedThreads = await conversationManager.loadUserConversations(currentUser);
            
            // Merge: preserve canonical Zen, add other threads
            setThreads(prev => {
              const zenThread = prev.find(t => t.id === ZEN_CANONICAL_SESSION_ID || t.isPrimary);
              const otherThreads = loadedThreads.filter(t => 
                t.id !== ZEN_CANONICAL_SESSION_ID && !t.isPrimary
              );
              
              // If VVAULT returned a Zen thread with messages, use that data
              const vvaultZen = loadedThreads.find(t => 
                t.id === ZEN_CANONICAL_SESSION_ID || 
                t.constructId === ZEN_CANONICAL_CONSTRUCT_ID ||
                t.isPrimary
              );
              
              const finalZen = vvaultZen 
                ? { ...vvaultZen, isPrimary: true, constructId: ZEN_CANONICAL_CONSTRUCT_ID }
                : zenThread || canonicalZen;
              
              // Sort: Zen first, then by updatedAt
              const merged = [finalZen, ...otherThreads];
              return merged.sort((a, b) => {
                if (a.isPrimary) return -1;
                if (b.isPrimary) return 1;
                return (b.updatedAt || 0) - (a.updatedAt || 0);
              });
            });
            
            // Update conversations format for Sidebar - ALWAYS guarantee Zen is present
            // Use canonicalZen directly as the bulletproof fallback (closure-captured)
            const canonicalZenConv: Conversation = {
              id: canonicalZen.id,
              title: canonicalZen.title,
              messages: [],
              createdAt: new Date(canonicalZen.createdAt!).toISOString(),
              updatedAt: new Date(canonicalZen.updatedAt!).toISOString()
            };
            
            // Check if VVAULT returned a Zen thread with richer data
            const vvaultZen = loadedThreads.find(t => 
              t.id === ZEN_CANONICAL_SESSION_ID || 
              t.constructId === ZEN_CANONICAL_CONSTRUCT_ID ||
              t.isPrimary
            );
            
            // Build guaranteed Zen conversation (prefer VVAULT data if available, else use canonical)
            // Preserve canonical timestamps if VVAULT data omits them
            const guaranteedZenConv: Conversation = vvaultZen ? {
              id: vvaultZen.id || ZEN_CANONICAL_SESSION_ID,
              title: vvaultZen.title || 'Zen',
              messages: vvaultZen.messages || [],
              createdAt: vvaultZen.createdAt 
                ? new Date(vvaultZen.createdAt).toISOString() 
                : canonicalZenConv.createdAt,
              updatedAt: vvaultZen.updatedAt 
                ? new Date(vvaultZen.updatedAt).toISOString() 
                : canonicalZenConv.updatedAt
            } : canonicalZenConv;
            
            // Build other conversations (non-Zen)
            const otherConvs = loadedThreads
              .filter(t => 
                t.id !== ZEN_CANONICAL_SESSION_ID && 
                t.constructId !== ZEN_CANONICAL_CONSTRUCT_ID &&
                !t.isPrimary
              )
              .map(thread => ({
                id: thread.id,
                title: thread.title || 'Untitled',
                messages: thread.messages || [],
                createdAt: thread.createdAt ? new Date(thread.createdAt).toISOString() : new Date().toISOString(),
                updatedAt: thread.updatedAt ? new Date(thread.updatedAt).toISOString() : new Date().toISOString()
              }));
            
            // INVARIANT: Zen is ALWAYS first in the array - no dependency on prev state
            setConversations([guaranteedZenConv, ...otherConvs]);
          } catch (vvaultError) {
            console.warn('VVAULT load failed, using canonical Zen fallback:', vvaultError);
            // Canonical Zen already set, no action needed
          }
        }
      } catch (error) {
        console.error('Failed to load user or conversations:', error);
      }
    };
    loadUser();
  }, [conversationManager]);

  // Handlers
  const handleConversationSelect = useCallback((id: string) => {
    setCurrentConversationId(id);
    navigate(`/app/chat/${id}`);
  }, [navigate]);

  const handleNewConversation = useCallback(() => {
    const newThread: ConversationThread = {
      id: `thread-${Date.now()}`,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    // Add new thread but keep Zen first (primary construct invariant)
    setThreads(prev => {
      const zenThread = prev.find(t => t.id === ZEN_CANONICAL_SESSION_ID || t.isPrimary);
      const others = prev.filter(t => t.id !== ZEN_CANONICAL_SESSION_ID && !t.isPrimary);
      return zenThread ? [zenThread, newThread, ...others] : [newThread, ...prev];
    });
    setConversations(prev => {
      const zenConv = prev.find(c => c.id === ZEN_CANONICAL_SESSION_ID);
      const others = prev.filter(c => c.id !== ZEN_CANONICAL_SESSION_ID);
      const newConv = {
        id: newThread.id,
        title: newThread.title,
        messages: [],
        createdAt: newThread.createdAt ? new Date(newThread.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: newThread.updatedAt ? new Date(newThread.updatedAt).toISOString() : new Date().toISOString()
      };
      return zenConv ? [zenConv, newConv, ...others] : [newConv, ...prev];
    });
    navigate(`/app/chat/${newThread.id}`);
  }, [navigate]);

  const handleNewConversationWithGPT = useCallback((gptId: string) => {
    const newThread: ConversationThread = {
      id: `gpt-${gptId}-${Date.now()}`,
      title: `Chat with ${gptId}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    // Add new thread but keep Zen first (primary construct invariant)
    setThreads(prev => {
      const zenThread = prev.find(t => t.id === ZEN_CANONICAL_SESSION_ID || t.isPrimary);
      const others = prev.filter(t => t.id !== ZEN_CANONICAL_SESSION_ID && !t.isPrimary);
      return zenThread ? [zenThread, newThread, ...others] : [newThread, ...prev];
    });
    setConversations(prev => {
      const zenConv = prev.find(c => c.id === ZEN_CANONICAL_SESSION_ID);
      const others = prev.filter(c => c.id !== ZEN_CANONICAL_SESSION_ID);
      const newConv = {
        id: newThread.id,
        title: newThread.title,
        messages: [],
        createdAt: newThread.createdAt ? new Date(newThread.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: newThread.updatedAt ? new Date(newThread.updatedAt).toISOString() : new Date().toISOString()
      };
      return zenConv ? [zenConv, newConv, ...others] : [newConv, ...prev];
    });
    navigate(`/app/chat/${newThread.id}`);
  }, [navigate]);

  const handleDeleteConversation = useCallback((id: string) => {
    // CANONICAL ZEN PROTECTION: Never delete Zen (primary construct)
    if (id === ZEN_CANONICAL_SESSION_ID) {
      console.log('🛡️ [Layout] Cannot delete Zen - primary construct is protected');
      return;
    }
    
    // Also check if the thread is marked as primary
    const threadToDelete = threads.find(t => t.id === id);
    if (threadToDelete?.isPrimary || threadToDelete?.constructId === ZEN_CANONICAL_CONSTRUCT_ID) {
      console.log('🛡️ [Layout] Cannot delete primary construct thread');
      return;
    }
    
    setThreads(prev => prev.filter(t => t.id !== id));
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      navigate('/app');
    }
  }, [currentConversationId, navigate, threads]);

  const handleUpdateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
    // Convert string dates to number timestamps for threads (only if provided)
    const threadUpdates: Partial<ConversationThread> = { ...updates };
    // Only convert timestamps if they're actually being updated
    if (updates.createdAt !== undefined) {
      threadUpdates.createdAt = new Date(updates.createdAt).getTime();
    } else {
      delete threadUpdates.createdAt; // Don't overwrite with undefined
    }
    if (updates.updatedAt !== undefined) {
      threadUpdates.updatedAt = new Date(updates.updatedAt).getTime();
    } else {
      delete threadUpdates.updatedAt; // Don't overwrite with undefined
    }
    setThreads(prev => prev.map(t => t.id === id ? { ...t, ...threadUpdates } : t));
    setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  // Navigation handlers for Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [_showSettings, _setShowSettings] = useState(false); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  const handleOpenSearch = useCallback(() => {
    setShowSearchModal(true);
  }, []);

  const handleOpenLibrary = useCallback(() => {
    navigate('/app/library');
  }, [navigate]);

  const handleOpenCodex = useCallback(() => {
    navigate('/app/codex');
  }, [navigate]);

  const handleOpenProjects = useCallback(() => {
    setShowProjectsModal(true);
  }, []);

  const handleOpenExplore = useCallback(() => {
    navigate('/app/explore');
  }, [navigate]);

  const handleShowRuntimeDashboard = useCallback(() => {
    navigate('/app/runtime');
  }, [navigate]);

  const handleToggleCollapsed = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const handleShowSettings = useCallback(() => {
    navigate('/app/settings');
  }, [navigate]);

  const handleShowGPTCreator = useCallback(() => {
    navigate('/app/gpt-creator');
  }, [navigate]);

  const handleShowGPTs = useCallback(() => {
    navigate('/app/explore');
  }, [navigate]);

  const sendMessage = useCallback(async (threadId: string, text: string, files: File[]) => {
    // This will be handled by the Chat component, but we need to provide it in context
    console.log('sendMessage called', { threadId, text, files });
  }, []);

  const renameThread = useCallback((threadId: string, title: string) => {
    handleUpdateConversation(threadId, { title });
  }, [handleUpdateConversation]);

  const newThread = useCallback(() => {
    handleNewConversation();
  }, [handleNewConversation]);

  const outletContext = {
    threads,
    sendMessage,
    renameThread,
    newThread,
    user
  };

  return (
    <ThemeProvider user={user}>
      <div className="flex h-screen bg-gray-900 text-white">
        <Sidebar
          conversations={conversations}
          threads={threads}
          currentConversationId={currentConversationId}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
          onNewConversationWithGPT={handleNewConversationWithGPT}
          onDeleteConversation={handleDeleteConversation}
          onUpdateConversation={handleUpdateConversation}
          onOpenSearch={handleOpenSearch}
          onOpenLibrary={handleOpenLibrary}
          onOpenCodex={handleOpenCodex}
          onOpenProjects={handleOpenProjects}
          onOpenExplore={handleOpenExplore}
          onShowRuntimeDashboard={handleShowRuntimeDashboard}
          onShowSettings={handleShowSettings}
          onShowGPTCreator={handleShowGPTCreator}
          onShowGPTs={handleShowGPTs}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleCollapsed}
          currentUser={user}
        />
        <main className="flex-1 flex flex-col">
          <Outlet context={outletContext} />
        </main>
        
        <SearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectConversation={handleConversationSelect}
        />
        
        <ProjectsModal
          isOpen={showProjectsModal}
          onClose={() => setShowProjectsModal(false)}
        />
      </div>
    </ThemeProvider>
  );
};

export default Layout;