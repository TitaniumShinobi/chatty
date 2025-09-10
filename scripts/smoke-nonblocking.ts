#!/usr/bin/env tsx

// Smoke test for non-blocking PDF parsing
import { parsePdfInWorker } from '../src/lib/fileWorkers';

async function testNonBlockingParsing() {
  console.log('🧪 Testing non-blocking PDF parsing...\n');
  
  // Create a mock PDF file for testing
  const mockPdfContent = `
    This is a test PDF document for non-blocking parsing.
    It contains multiple lines of text to simulate a real PDF.
    The purpose is to test that the worker-based parsing doesn't block the main thread.
    This should be extracted and processed correctly without freezing the UI.
    The system should be able to handle PDF content in a background worker.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.
    Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.
    This is additional content to make the file larger and more realistic.
    The worker should process this content without blocking the main thread.
    Progress should be reported back to the main thread during processing.
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
  
  // Mock Worker for testing
  global.Worker = class MockWorker {
    onmessage: ((e: any) => void) | null = null;
    postMessage: (data: any) => void;
    terminate: () => void;
    
    constructor() {
      this.postMessage = (data) => {
        // Simulate worker processing
        setTimeout(() => {
          if (data.type === 'PARSE_PDF') {
            // Simulate progress updates
            if (this.onmessage) {
              this.onmessage({ data: { type: 'PROGRESS', id: data.id, v: 0.5 } });
              this.onmessage({ data: { type: 'PROGRESS', id: data.id, v: 1.0 } });
              this.onmessage({ data: { type: 'RESULT', id: data.id, text: mockPdfContent } });
            }
          }
        }, 100);
      };
      this.terminate = () => {};
    }
  } as any;
  
  console.log('1️⃣ Testing non-blocking PDF parsing...');
  console.log('File:', mockFile.name, 'Size:', mockFile.size, 'Type:', mockFile.type);
  
  try {
    const startTime = Date.now();
    let progressUpdates = 0;
    
    const text = await parsePdfInWorker(
      mockFile,
      (progress) => {
        progressUpdates++;
        console.log(`📊 Progress: ${Math.round(progress * 100)}%`);
      }
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ PDF parsed successfully');
    console.log('Parsed content length:', text.length);
    console.log('Processing time:', duration + 'ms');
    console.log('Progress updates received:', progressUpdates);
    console.log('Preview:', text.substring(0, 200) + '...');
    console.log('');
    
    // Assertions
    const assertions = [
      {
        name: 'PDF parsing completed successfully',
        passed: text.length > 0,
        expected: 'text content > 0',
        actual: text.length + ' characters'
      },
      {
        name: 'Processing time is reasonable (< 500ms)',
        passed: duration < 500,
        expected: '< 500ms',
        actual: duration + 'ms'
      },
      {
        name: 'Progress updates were received',
        passed: progressUpdates > 0,
        expected: '> 0 progress updates',
        actual: progressUpdates + ' updates'
      },
      {
        name: 'Content contains expected text',
        passed: text.includes('test PDF document'),
        expected: 'contains test content',
        actual: text.includes('test PDF document') ? 'yes' : 'no'
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
    console.error('❌ Non-blocking PDF parsing failed:', error);
    return false;
  }
}

// Run the test
testNonBlockingParsing().catch(console.error);
