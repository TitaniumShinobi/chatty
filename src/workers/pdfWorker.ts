/// <reference lib="webworker" />
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set worker source for PDF.js
GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

type MsgIn =
  | { type: 'PARSE_PDF'; id: string; buf: ArrayBuffer }
  | { type: 'ABORT' };
type MsgOut =
  | { type: 'PROGRESS'; id: string; v: number }
  | { type: 'RESULT'; id: string; text: string }
  | { type: 'ERROR'; id: string; message: string };

let aborted = false;
self.onmessage = async (e: MessageEvent<MsgIn>) => {
  if (e.data.type === 'ABORT') { aborted = true; return; }
  const { id, buf } = e.data;
  try {
    const task = getDocument({ data: buf, rangeChunkSize: 65536 });
    task.onProgress = (p: { loaded: number; total: number }) => {
      postMessage({ type: 'PROGRESS', id, v: (p.loaded / (p.total || 1)) } as MsgOut);
    };
    const pdf = await task.promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      if (aborted) { aborted = false; return; }
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map((it:any)=>it.str).join(' ') + '\n';
      postMessage({ type:'PROGRESS', id, v:i/pdf.numPages } as MsgOut);
    }
    postMessage({ type:'RESULT', id, text } as MsgOut);
  } catch (err:any) {
    postMessage({ type:'ERROR', id, message: err?.message || 'parse_failed' } as MsgOut);
  }
};
