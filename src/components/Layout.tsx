import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ThemeProvider } from '../lib/ThemeContext';
import { fetchMe, type User } from '../lib/auth';
import { VVAULTConversationManager, type ConversationThread } from '../lib/vvaultConversationManager';
import type { Conversation } from '../types';

const Layout: React.FC = () => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Layout.tsx:10',message:'Layout component rendering',data:{hasSidebar:true,hasOutlet:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Layout.tsx:28',message:'Loading conversations for user',data:{userId:currentUser.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          
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
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Layout.tsx:42',message:'Conversations loaded',data:{threadCount:loadedThreads.length,conversationCount:convs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        }
      } catch (error) {
        console.error('Failed to load user or conversations:', error);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Layout.tsx:47',message:'Failed to load user/conversations',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Layout.tsx:118',message:'Providing context to Outlet',data:{threadsCount:threads.length,conversationsCount:conversations.length,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

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
          currentUser={user}
        />
        <main className="flex-1 flex flex-col">
          <Outlet context={outletContext} />
        </main>
      </div>
    </ThemeProvider>
  );
};

export default Layout;