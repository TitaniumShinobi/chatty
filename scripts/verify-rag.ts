#!/usr/bin/env tsx

// Verification script for RAG system
import { ConversationAI } from '../src/lib/conversationAI';

async function verifyRAG() {
  console.log('🔍 Verifying RAG system...\n');
  
  // Mock browser APIs
  global.FileReader = class MockFileReader {
    onload: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    
    readAsText(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: testDocumentContent } });
        }
      }, 0);
    }
    
    readAsDataURL(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: 'data:text/plain;base64,' + Buffer.from(testDocumentContent).toString('base64') } });
        }
      }, 0);
    }
  } as any;
  
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  } as any;
  
  const testDocumentContent = `
    Pricing and Subscription Tiers
    
    Basic Plan: $9.99/month
    - 100 API calls per day
    - Basic support
    - Standard features
    
    Pro Plan: $29.99/month
    - 1000 API calls per day
    - Priority support
    - Advanced features
    - Custom integrations
    
    Enterprise Plan: $99.99/month
    - Unlimited API calls
    - 24/7 support
    - All features
    - Dedicated account manager
    - Custom development
    
    Pricing is based on usage and includes all standard features.
    Enterprise customers get additional customization options.
  `;
  
  const testFile = new File([testDocumentContent], 'pricing-document.pdf', { type: 'application/pdf' });
  
  console.log('1️⃣ Initializing ConversationAI...');
  const conversationAI = new ConversationAI();
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('✅ ConversationAI initialized');
  console.log('');
  
  console.log('2️⃣ Testing file upload...');
  const uploadResponse = await conversationAI.processMessage('Upload this pricing document', [testFile]);
  console.log('✅ File uploaded');
  console.log('Response:', uploadResponse);
  
  // Check if response is packet-based
  const isPacket = uploadResponse && typeof uploadResponse === 'object' && 'op' in uploadResponse;
  console.log(`📦 Response is packet: ${isPacket ? '✅' : '❌'}`);
  console.log('');
  
  console.log('3️⃣ Testing document-grounded question...');
  const questionResponse = await conversationAI.processMessage('What are the pricing tiers?');
  console.log('✅ Question processed');
  console.log('Response:', questionResponse);
  
  // Check semantic context
  const semanticContext = conversationAI.getSemanticContext();
  console.log('🔍 Semantic context:', semanticContext ? '✅ Present' : '❌ Missing');
  
  if (semanticContext) {
    console.log(`- Query: "${semanticContext.lastQuery}"`);
    console.log(`- Relevant chunks: ${semanticContext.relevantChunks.length}`);
    console.log(`- Retrieval time: ${semanticContext.retrievalTime}ms`);
    semanticContext.relevantChunks.forEach((chunk, index) => {
      console.log(`  ${index + 1}. ${chunk.source} (${(chunk.similarity * 100).toFixed(1)}% similarity)`);
    });
  }
  console.log('');
  
  console.log('4️⃣ Testing non-document question...');
  const generalResponse = await conversationAI.processMessage('Hello, how are you?');
  console.log('✅ General question processed');
  console.log('Response:', generalResponse);
  
  // Check that no semantic context for general question
  const generalSemanticContext = conversationAI.getSemanticContext();
  console.log('🔍 Semantic context for general question:', generalSemanticContext ? '❌ Present (unexpected)' : '✅ None (expected)');
  console.log('');
  
  console.log('5️⃣ Testing another document question...');
  const pricingQuestion = await conversationAI.processMessage('What does the Pro plan cost?');
  console.log('✅ Pricing question processed');
  console.log('Response:', pricingQuestion);
  
  const pricingSemanticContext = conversationAI.getSemanticContext();
  if (pricingSemanticContext) {
    console.log('🔍 Semantic context found:');
    console.log(`- Query: "${pricingSemanticContext.lastQuery}"`);
    console.log(`- Relevant chunks: ${pricingSemanticContext.relevantChunks.length}`);
    console.log(`- Retrieval time: ${pricingSemanticContext.retrievalTime}ms`);
  }
  console.log('');
  
  console.log('6️⃣ Checking processed documents...');
  const processedDocs = conversationAI.getProcessedDocuments();
  console.log(`📊 Processed documents: ${processedDocs.length}`);
  processedDocs.forEach(doc => {
    console.log(`- ${doc.fileName}: ${doc.chunks} chunks, ${doc.words} words, indexed: ${doc.indexed}`);
  });
  console.log('');
  
  // Final verification
  console.log('✅ Verification Results:');
  console.log(`1. Packet responses: ${isPacket ? '✅' : '❌'}`);
  console.log(`2. Document upload: ${uploadResponse ? '✅' : '❌'}`);
  console.log(`3. Semantic retrieval: ${semanticContext && semanticContext.relevantChunks.length > 0 ? '✅' : '❌'}`);
  console.log(`4. Fast retrieval: ${semanticContext && semanticContext.retrievalTime < 100 ? '✅' : '❌'}`);
  console.log(`5. Context persistence: ${pricingSemanticContext && pricingSemanticContext.relevantChunks.length > 0 ? '✅' : '❌'}`);
  console.log(`6. No retrieval for general questions: ${!generalSemanticContext ? '✅' : '❌'}`);
  console.log(`7. Documents indexed: ${processedDocs.length > 0 ? '✅' : '❌'}`);
  
  const allPassed = isPacket && uploadResponse && semanticContext && semanticContext.relevantChunks.length > 0 && 
                   semanticContext.retrievalTime < 100 && pricingSemanticContext && !generalSemanticContext && processedDocs.length > 0;
  
  console.log(`\n🎯 Overall: ${allPassed ? '✅ RAG system is working correctly!' : '❌ Some issues detected'}`);
  
  return allPassed;
}

// Run verification
verifyRAG().catch(console.error);
