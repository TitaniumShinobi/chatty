import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';
import ProjectsModal from './ProjectsModal';
import { ThemeProvider } from '../lib/ThemeContext';
import { fetchMe, type User } from '../lib/auth';
import { VVAULTConversationManager, type ConversationThread } from '../lib/vvaultConversationManager';
import type { Conversation } from '../types';

const Layout: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const navigate = useNavigate();
  const conversationManager = VVAULTConversationManager.getInstance();

  // Load user and conversations
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await fetchMe();
        setUser(currentUser);
        
        if (currentUser) {
          const loadedThreads = await conversationManager.loadUserConversations(currentUser);
          setThreads(loadedThreads);
          
          // Convert threads to conversations format for Sidebar
          const convs: Conversation[] = loadedThreads.map(thread => ({
            id: thread.id,
            title: thread.title || 'Untitled',
            messages: thread.messages || [],
            createdAt: thread.createdAt ? new Date(thread.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: thread.updatedAt ? new Date(thread.updatedAt).toISOString() : new Date().toISOString()
          }));
          setConversations(convs);
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
    setThreads(prev => [newThread, ...prev]);
    setConversations(prev => [{
      id: newThread.id,
      title: newThread.title,
      messages: [],
      createdAt: newThread.createdAt ? new Date(newThread.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: newThread.updatedAt ? new Date(newThread.updatedAt).toISOString() : new Date().toISOString()
    }, ...prev]);
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
    setThreads(prev => [newThread, ...prev]);
    setConversations(prev => [{
      id: newThread.id,
      title: newThread.title,
      messages: [],
      createdAt: newThread.createdAt ? new Date(newThread.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: newThread.updatedAt ? new Date(newThread.updatedAt).toISOString() : new Date().toISOString()
    }, ...prev]);
    navigate(`/app/chat/${newThread.id}`);
  }, [navigate]);

  const handleDeleteConversation = useCallback((id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      navigate('/app');
    }
  }, [currentConversationId, navigate]);

  const handleUpdateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  // Navigation handlers for Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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