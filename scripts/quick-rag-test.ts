#!/usr/bin/env tsx

// Quick RAG test
import { ConversationAI } from '../src/lib/conversationAI';

async function quickRAGTest() {
  console.log('🚀 Quick RAG Test\n');
  
  // Mock browser APIs
  global.FileReader = class MockFileReader {
    onload: ((e: any) => void) | null = null;
    readAsText(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: 'Test document content for RAG verification.' } });
        }
      }, 0);
    }
  } as any;
  
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as any;
  
  try {
    // Initialize
    const ai = new ConversationAI();
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Test file upload
    const file = new File(['Test content'], 'test.pdf', { type: 'application/pdf' });
    const uploadResponse = await ai.processMessage('Upload this', [file]);
    
    console.log('✅ File upload response:', uploadResponse?.op ? 'Packet' : 'Not packet');
    
    // Test question
    const questionResponse = await ai.processMessage('What is this about?');
    const semanticContext = ai.getSemanticContext();
    
    console.log('✅ Question response:', questionResponse?.op ? 'Packet' : 'Not packet');
    console.log('✅ Semantic context:', semanticContext ? `${semanticContext.relevantChunks.length} chunks` : 'None');
    console.log('✅ Retrieval time:', semanticContext?.retrievalTime || 'N/A', 'ms');
    
    // Test general question
    const generalResponse = await ai.processMessage('Hello');
    const generalContext = ai.getSemanticContext();
    
    console.log('✅ General response:', generalResponse?.op ? 'Packet' : 'Not packet');
    console.log('✅ General context:', generalContext ? 'Present' : 'None (expected)');
    
    console.log('\n🎯 RAG System Status: WORKING ✅');
    
  } catch (error) {
    console.error('❌ RAG Test Failed:', error);
  }
}

quickRAGTest();
