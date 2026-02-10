#!/usr/bin/env tsx

// Smoke test for enhanced conversation AI with semantic retrieval
import { ConversationAI } from '../src/lib/conversationAI';

async function testSemanticRetrieval() {
  console.log('🧪 Testing enhanced conversation AI with semantic retrieval...\n');
  
  // Mock browser APIs for Node.js environment
  global.FileReader = class MockFileReader {
    onload: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    
    readAsText(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: file.name.includes('research') ? researchContent : manualContent } });
        }
      }, 0);
    }
    
    readAsDataURL(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: 'data:text/plain;base64,' + Buffer.from(file.name.includes('research') ? researchContent : manualContent).toString('base64') } });
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
  
  // Create test content
  const researchContent = `
    Machine Learning Research Paper
    
    Abstract: This paper presents a comprehensive analysis of deep learning algorithms for natural language processing.
    We examine transformer architectures, attention mechanisms, and their applications in conversational AI systems.
    
    Introduction: Recent advances in machine learning have revolutionized how we approach natural language understanding.
    The development of transformer models has enabled unprecedented performance in tasks such as text generation,
    sentiment analysis, and question answering.
    
    Methodology: Our research methodology involves analyzing various neural network architectures including
    BERT, GPT, and T5 models. We evaluate their performance on standard NLP benchmarks and assess
    their suitability for real-world applications.
    
    Results: The experimental results demonstrate that transformer-based models significantly outperform
    traditional approaches. Our analysis shows that attention mechanisms are crucial for understanding
    context and generating coherent responses.
    
    Conclusion: The findings suggest that modern deep learning approaches are essential for building
    effective conversational AI systems. Future work should focus on improving efficiency and reducing
    computational requirements.
  `;
  
  const manualContent = `
    User Manual: Advanced Features
    
    Getting Started: This manual covers advanced features of the system including file processing,
    semantic search, and intelligent response generation. Users can upload documents and ask
    questions about their content.
    
    File Upload: The system supports various file formats including PDF, TXT, and DOCX files.
    Uploaded files are automatically processed and indexed for semantic search capabilities.
    
    Semantic Search: Users can ask questions about uploaded documents and receive relevant
    information based on semantic similarity. The system uses advanced algorithms to find
    the most relevant content chunks.
    
    Response Generation: The AI generates responses based on the retrieved content and
    maintains context throughout the conversation. All responses are packet-based for
    consistent user experience.
  `;
  
  // Create test files
  const researchFile = new File([researchContent], 'research-paper.pdf', { type: 'application/pdf' });
  const manualFile = new File([manualContent], 'user-manual.txt', { type: 'text/plain' });
  
  console.log('1️⃣ Initializing enhanced conversation AI...');
  
  const conversationAI = new ConversationAI();
  
  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('✅ Conversation AI initialized');
  console.log('');
  
  console.log('2️⃣ Testing file upload with semantic processing...');
  
  // Upload research paper
  const uploadResponse1 = await conversationAI.processMessage('Upload this research paper', [researchFile]);
  console.log('✅ Research paper uploaded');
  console.log('Response:', uploadResponse1);
  
  // Upload manual
  const uploadResponse2 = await conversationAI.processMessage('Also upload this manual', [manualFile]);
  console.log('✅ Manual uploaded');
  console.log('Response:', uploadResponse2);
  
  // Check processed documents
  const processedDocs = conversationAI.getProcessedDocuments();
  console.log('📊 Processed documents:', processedDocs.length);
  processedDocs.forEach(doc => {
    console.log(`- ${doc.fileName}: ${doc.chunks} chunks, ${doc.words} words`);
  });
  console.log('');
  
  console.log('3️⃣ Testing semantic retrieval with questions...');
  
  // Ask about machine learning
  const question1 = await conversationAI.processMessage('What does the research say about machine learning?');
  console.log('✅ Question about machine learning processed');
  console.log('Response:', question1);
  
  // Check semantic context
  const semanticContext1 = conversationAI.getSemanticContext();
  if (semanticContext1) {
    console.log('🔍 Semantic context found:');
    console.log(`- Query: "${semanticContext1.lastQuery}"`);
    console.log(`- Relevant chunks: ${semanticContext1.relevantChunks.length}`);
    console.log(`- Retrieval time: ${semanticContext1.retrievalTime}ms`);
    semanticContext1.relevantChunks.forEach((chunk, index) => {
      console.log(`  ${index + 1}. ${chunk.source} (${(chunk.similarity * 100).toFixed(1)}% similarity)`);
    });
  }
  console.log('');
  
  // Ask about file upload features
  const question2 = await conversationAI.processMessage('How do I upload files to the system?');
  console.log('✅ Question about file upload processed');
  console.log('Response:', question2);
  
  // Check semantic context
  const semanticContext2 = conversationAI.getSemanticContext();
  if (semanticContext2) {
    console.log('🔍 Semantic context found:');
    console.log(`- Query: "${semanticContext2.lastQuery}"`);
    console.log(`- Relevant chunks: ${semanticContext2.relevantChunks.length}`);
    console.log(`- Retrieval time: ${semanticContext2.retrievalTime}ms`);
    semanticContext2.relevantChunks.forEach((chunk, index) => {
      console.log(`  ${index + 1}. ${chunk.source} (${(chunk.similarity * 100).toFixed(1)}% similarity)`);
    });
  }
  console.log('');
  
  console.log('4️⃣ Testing general conversation without files...');
  
  // General greeting
  const greeting = await conversationAI.processMessage('Hello there!');
  console.log('✅ Greeting processed');
  console.log('Response:', greeting);
  
  // Check that no semantic context is present for non-file queries
  const semanticContext3 = conversationAI.getSemanticContext();
  console.log('🔍 Semantic context for greeting:', semanticContext3 ? 'present' : 'none (expected)');
  console.log('');
  
  console.log('5️⃣ Testing context persistence...');
  
  // Ask another question about the uploaded documents
  const question3 = await conversationAI.processMessage('What are the key findings?');
  console.log('✅ Question about key findings processed');
  console.log('Response:', question3);
  
  // Check semantic context
  const semanticContext4 = conversationAI.getSemanticContext();
  if (semanticContext4) {
    console.log('🔍 Semantic context found:');
    console.log(`- Query: "${semanticContext4.lastQuery}"`);
    console.log(`- Relevant chunks: ${semanticContext4.relevantChunks.length}`);
    console.log(`- Retrieval time: ${semanticContext4.retrievalTime}ms`);
  }
  console.log('');
  
  // Assertions
  const assertions = [
    {
      name: 'Files were processed successfully',
      passed: processedDocs.length === 2,
      expected: '2 processed documents',
      actual: `${processedDocs.length} processed documents`
    },
    {
      name: 'Semantic retrieval works for relevant queries',
      passed: semanticContext1 && semanticContext1.relevantChunks.length > 0,
      expected: 'semantic context with relevant chunks',
      actual: semanticContext1 ? `${semanticContext1.relevantChunks.length} chunks` : 'no semantic context'
    },
    {
      name: 'Semantic retrieval is fast',
      passed: semanticContext1 && semanticContext1.retrievalTime < 100,
      expected: '< 100ms retrieval time',
      actual: semanticContext1 ? `${semanticContext1.retrievalTime}ms` : 'no retrieval'
    },
    {
      name: 'Context persists across queries',
      passed: semanticContext4 && semanticContext4.relevantChunks.length > 0,
      expected: 'semantic context persists',
      actual: semanticContext4 ? `${semanticContext4.relevantChunks.length} chunks` : 'no semantic context'
    },
    {
      name: 'Non-file queries don\'t trigger semantic retrieval',
      passed: !semanticContext3,
      expected: 'no semantic context for greeting',
      actual: semanticContext3 ? 'semantic context present' : 'no semantic context'
    },
    {
      name: 'Responses are packet-based',
      passed: question1 && typeof question1 === 'object' && 'op' in question1,
      expected: 'packet response with op code',
      actual: typeof question1
    }
  ];
  
  console.log('✅ Assertions:');
  assertions.forEach(assertion => {
    const status = assertion.passed ? '✅' : '❌';
    console.log(`${status} ${assertion.name}: ${assertion.expected} (got ${assertion.actual})`);
  });
  
  const allPassed = assertions.every(a => a.passed);
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '❌ Some tests failed!'}`);
  
  return allPassed;
}

// Run the test
testSemanticRetrieval().catch(console.error);
