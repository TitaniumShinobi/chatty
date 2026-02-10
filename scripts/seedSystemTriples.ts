#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { memoryStore } from '../src/engine/memory/MemoryStore.js';

function summarize(text:string, max=300){
  const firstPara = text.split(/\n\s*\n/)[0];
  return firstPara.slice(0,max).replace(/\s+/g,' ').trim();
}

const readmePath = path.resolve('./README.md');
if(!fs.existsSync(readmePath)){
  console.error('README.md not found');
  process.exit(1);
}
const readme = fs.readFileSync(readmePath,'utf8');
const summary = summarize(readme);

memoryStore.addTriples('system', [{ s:'Chatty', p:'about', o: summary, ts: Date.now() } as any]);
console.log('Inserted summary triple into DB');
