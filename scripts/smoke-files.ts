#!/usr/bin/env tsx

// Smoke test for file parsing pipeline
import { FileParser } from '../src/lib/utils/fileParser';
import { ConversationAI } from '../src/lib/conversationAI';

async function testFileParsing() {
  console.log('🧪 Testing file parsing pipeline...\n');
  
  // Create a mock PDF file for testing
  const mockPdfContent = `
    This is a test PDF document.
    It contains multiple lines of text.
    The purpose is to test the file parsing pipeline.
    This should be extracted and processed correctly.
    The system should be able to handle PDF content.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.
    Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.
  `;
  
  // Create a mock File object
  const mockFile = new File([mockPdfContent], 'test-document.pdf', {
    type: 'application/pdf'
  });
  
  // Mock browser APIs for Node.js environment
  global.FileReader = class MockFileReader {
    onload: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    
    readAsText(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: mockPdfContent } });
        }
      }, 0);
    }
    
    readAsArrayBuffer(file: File) {
      setTimeout(() => {
        if (this.onload) {
          const buffer = new ArrayBuffer(mockPdfContent.length);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < mockPdfContent.length; i++) {
            view[i] = mockPdfContent.charCodeAt(i);
          }
          this.onload({ target: { result: buffer } });
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
  
  console.log('1️⃣ Testing file parsing...');
  console.log('File:', mockFile.name, 'Size:', mockFile.size, 'Type:', mockFile.type);
  
  try {
    const parsedContent = await FileParser.parseFile(mockFile);
    console.log('✅ File parsed successfully');
    console.log('Parsed content length:', parsedContent.extractedText.length);
    console.log('Metadata:', parsedContent.metadata);
    console.log('Preview:', parsedContent.extractedText.substring(0, 200) + '...');
    console.log('');
    
    // Test 2: ConversationAI with file
    console.log('2️⃣ Testing conversationAI with file...');
    const conversationAI = new ConversationAI();
    
    // Create a mock File array
    const mockFiles = [mockFile];
    
    const response = await conversationAI.processMessage('Analyze this document', mockFiles);
    console.log('Response:', response);
    console.log('Context after file analysis:', conversationAI.getContext());
    console.log('');
    
    // Assertions
    const assertions = [
      {
        name: 'File parsing produces text > 200 chars',
        passed: parsedContent.extractedText.length > 200,
        expected: '> 200 characters',
        actual: parsedContent.extractedText.length + ' characters'
      },
      {
        name: 'Parsed content has metadata',
        passed: parsedContent.metadata && Object.keys(parsedContent.metadata).length > 0,
        expected: 'metadata object',
        actual: parsedContent.metadata ? 'has metadata' : 'no metadata'
      },
      {
        name: 'Assistant response is packet-based',
        passed: response && typeof response === 'object' && 'op' in response,
        expected: 'object with op property',
        actual: typeof response
      },
      {
        name: 'File context is set in conversation',
        passed: conversationAI.getContext().fileContext !== undefined,
        expected: 'fileContext exists',
        actual: conversationAI.getContext().fileContext ? 'exists' : 'missing'
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
    
  } catch (error) {
    console.error('❌ File parsing failed:', error);
    return false;
  }
}

// Run the test
testFileParsing().catch(console.error);
