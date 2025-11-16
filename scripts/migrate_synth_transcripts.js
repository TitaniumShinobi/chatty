#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/VVAULT';
const DEFAULT_USER_ID = '690ec2d8c980c59365f284f5';
const userId = process.argv[2] || DEFAULT_USER_ID;
const constructFolder = 'synth-001';
const providerFolder = 'Chatty';
const sourceDir = path.join(VVAULT_ROOT, 'users', userId, 'transcripts');
const archiveDir = path.join(VVAULT_ROOT, '_archived', 'pre-consolidation');

async function migrateSynthTranscripts() {
  console.log('🔄 [Migration] Consolidating Synth transcripts for user', userId);
  const sessions = await safeReaddir(sourceDir);
  const synthSessions = sessions.filter(entry => entry.isDirectory() && entry.name.startsWith('synth_'));

  if (synthSessions.length === 0) {
    console.log('ℹ️ [Migration] No legacy Synth sessions detected. Nothing to do.');
    return;
  }

  const messages = [];
  for (const session of synthSessions) {
    const sessionPath = path.join(sourceDir, session.name);
    const files = await fs.readdir(sessionPath);
    const txtFiles = files.filter(file => file.endsWith('.txt'));

    for (const file of txtFiles) {
      const fullPath = path.join(sessionPath, file);
      const raw = await fs.readFile(fullPath, 'utf8');
      const timestamp = extractTimestamp(file);
      if (!timestamp) continue;
      const role = file.includes('_assistant') ? 'assistant' : 'user';
      const content = extractContent(raw);
      messages.push({ timestamp, role, content });
    }
  }

  messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (messages.length === 0) {
    console.log('⚠️ [Migration] No transcript messages found to consolidate.');
    return;
  }

  const targetDir = path.join(VVAULT_ROOT, constructFolder, providerFolder);
  await fs.mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, `${constructFolder}_core_chat.md`);

  const header = buildHeader({
    constructFolder,
    userId,
    userName: 'Devon Woodson',
    sessionId: `${constructFolder}-bootstrap`,
    firstTimestamp: messages[0].timestamp,
  });

  const body = buildBody(messages, 'Devon Woodson', 'Synth');

  await fs.writeFile(targetFile, header + body, { encoding: 'utf8' });
  console.log('✅ [Migration] Consolidated transcript written to', targetFile);

  await fs.mkdir(archiveDir, { recursive: true });
  for (const session of synthSessions) {
    const from = path.join(sourceDir, session.name);
    const to = path.join(archiveDir, session.name);
    await fs.rename(from, to).catch(async (error) => {
      if (error.code === 'EXDEV') {
        await fs.cp(from, to, { recursive: true });
        await fs.rm(from, { recursive: true, force: true });
      } else {
        throw error;
      }
    });
    console.log(`📦 [Migration] Archived ${session.name} → ${path.relative(VVAULT_ROOT, to)}`);
  }
}

function extractTimestamp(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+)_(?:user|assistant)/);
  if (!match) return null;
  const parts = match[1].split('T');
  if (parts.length !== 2) return null;
  const [datePart, timePart] = parts;
  const normalizedTime = timePart.replace(/-/g, ':');
  const iso = `${datePart}T${normalizedTime}`;
  return iso.endsWith('Z') ? iso : `${iso}Z`;
}

function extractContent(raw) {
  const parts = raw.split('\n---\n\n');
  return (parts[1] || raw).trim();
}

function buildHeader({ constructFolder, userId, userName, sessionId, firstTimestamp }) {
  const startPeriod = new Date(firstTimestamp).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `# Chatty Conversation Transcript -- ${constructFolder}\n` +
    `**Construct**: Synth (${constructFolder})\n` +
    `**Platform**: Chatty\n` +
    `**Period**: ${startPeriod} — Present\n` +
    `**User**: ${userName} (ID: ${userId})\n` +
    `**Session ID**: ${sessionId}\n\n---\n\n`;
}

function buildBody(messages, userName, assistantName) {
  let currentDate = '';
  let body = '';
  for (const message of messages) {
    const heading = formatDateHeading(message.timestamp);
    if (heading !== currentDate) {
      currentDate = heading;
      body += `\n## ${heading}\n\n`;
    }
    const speaker = message.role === 'user' ? userName : assistantName;
    const timeLabel = formatTimeLabel(message.timestamp);
    body += `**[${message.timestamp}] ${speaker} (${timeLabel})**:\n${message.content}\n\n`;
  }
  return body;
}

function formatDateHeading(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

async function safeReaddir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    console.error('❌ [Migration] Unable to read directory:', dir, error.message);
    return [];
  }
}

migrateSynthTranscripts().catch(error => {
  console.error('❌ [Migration] Failed to consolidate Synth transcripts:', error);
  process.exitCode = 1;
});
