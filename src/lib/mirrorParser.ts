export interface MirrorDevInfo {
  ts: string;
  surface: 'tab' | 'window' | 'screen';
  app: string;
  title: string;
  url: string;
  dev_signals: {
    files: string[];
    errors: string[];
    commands: string[];
    topics: string[];
  };
  confidence: number;
  raw_ocr_available: boolean;
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'before', 'being', 'between',
  'both', 'could', 'does', 'doing', 'down', 'during', 'each', 'every',
  'first', 'from', 'have', 'having', 'here', 'into', 'just', 'like',
  'make', 'many', 'more', 'most', 'much', 'must', 'need', 'only',
  'other', 'over', 'right', 'same', 'should', 'some', 'such', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'under', 'very', 'want', 'well', 'were', 'what',
  'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your',
  'const', 'function', 'return', 'import', 'export', 'class', 'async',
  'await', 'undefined', 'null', 'true', 'false', 'string', 'number',
]);

const APP_PATTERNS: [RegExp, string][] = [
  [/\bChrome\b/i, 'Chrome'],
  [/\bFirefox\b/i, 'Firefox'],
  [/\bSafari\b/i, 'Safari'],
  [/\bEdge\b/i, 'Edge'],
  [/\bVS\s*Code\b/i, 'VS Code'],
  [/\bVisual Studio Code\b/i, 'VS Code'],
  [/\bTerminal\b/i, 'Terminal'],
  [/\biTerm\b/i, 'iTerm'],
  [/\bFinder\b/i, 'Finder'],
  [/\bSlack\b/i, 'Slack'],
  [/\bDiscord\b/i, 'Discord'],
  [/\bFigma\b/i, 'Figma'],
  [/\bNotion\b/i, 'Notion'],
  [/\bXcode\b/i, 'Xcode'],
  [/\bIntelliJ\b/i, 'IntelliJ'],
  [/\bWebStorm\b/i, 'WebStorm'],
];

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;
const FILE_PATH_REGEX = /(?:^|[\s(["'])((\/[\w.-]+)+\.\w{1,10}|(?:src|lib|components?|pages?|server|dist|build|node_modules|public)\/[\w./-]+\.\w{1,10})/gm;
const ERROR_REGEX = /(?:^|\s)((?:TypeError|SyntaxError|ReferenceError|RangeError|Error|ERR_\w+|FATAL|ENOENT|EACCES|EPERM)[\s:].{0,200})/gim;
const COMMAND_REGEX = /^[\s]*[$>#]\s+(.+)$/gm;
const CLI_PATTERN_REGEX = /\b(npm\s+(?:run|install|start|build|test)|yarn\s+\w+|git\s+\w+|cd\s+\S+|mkdir\s+\S+|rm\s+\S+|ls\s+|cat\s+|grep\s+|curl\s+|wget\s+|docker\s+\w+|python\s+\S+|node\s+\S+|pip\s+\w+|cargo\s+\w+)\b/gim;

export function parseOcrToDevInfo(rawOcr: string, surface: 'tab' | 'window' | 'screen'): MirrorDevInfo {
  const lines = rawOcr.split('\n');
  const headerLines = lines.slice(0, 5).join(' ');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

  let app = 'Unknown';
  for (const [pattern, name] of APP_PATTERNS) {
    if (pattern.test(headerLines)) {
      app = name;
      break;
    }
  }
  if (app === 'Unknown') {
    for (const [pattern, name] of APP_PATTERNS) {
      if (pattern.test(rawOcr)) {
        app = name;
        break;
      }
    }
  }

  const title = lines[0]?.trim().substring(0, 120) || 'Unknown';

  const urls: string[] = [];
  let urlMatch;
  const urlRegex = new RegExp(URL_REGEX.source, 'g');
  while ((urlMatch = urlRegex.exec(rawOcr)) !== null) {
    if (!urls.includes(urlMatch[0])) urls.push(urlMatch[0]);
    if (urls.length >= 5) break;
  }

  const files: string[] = [];
  let fileMatch;
  const fileRegex = new RegExp(FILE_PATH_REGEX.source, 'gm');
  while ((fileMatch = fileRegex.exec(rawOcr)) !== null) {
    const f = fileMatch[1]?.trim();
    if (f && !files.includes(f)) files.push(f);
    if (files.length >= 10) break;
  }

  const errors: string[] = [];
  let errorMatch;
  const errorRegex = new RegExp(ERROR_REGEX.source, 'gim');
  while ((errorMatch = errorRegex.exec(rawOcr)) !== null) {
    const e = errorMatch[1]?.trim();
    if (e && !errors.includes(e)) errors.push(e);
    if (errors.length >= 5) break;
  }

  const commands: string[] = [];
  let cmdMatch;
  const cmdRegex = new RegExp(COMMAND_REGEX.source, 'gm');
  while ((cmdMatch = cmdRegex.exec(rawOcr)) !== null) {
    const c = cmdMatch[1]?.trim();
    if (c && !commands.includes(c)) commands.push(c);
  }
  const cliRegex = new RegExp(CLI_PATTERN_REGEX.source, 'gim');
  while ((cmdMatch = cliRegex.exec(rawOcr)) !== null) {
    const c = cmdMatch[1]?.trim();
    if (c && !commands.includes(c)) commands.push(c);
    if (commands.length >= 10) break;
  }

  const wordFreq: Record<string, number> = {};
  const words = rawOcr.toLowerCase().match(/[a-z]{5,}/g) || [];
  for (const w of words) {
    if (!STOP_WORDS.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }
  const topics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  let signalCount = 0;
  if (app !== 'Unknown') signalCount++;
  if (urls.length > 0) signalCount++;
  if (files.length > 0) signalCount++;
  if (errors.length > 0) signalCount++;
  if (commands.length > 0) signalCount++;
  if (topics.length > 0) signalCount++;
  const confidence = Math.min(1, signalCount / 6);

  return {
    ts: timestamp,
    surface,
    app,
    title,
    url: urls[0] || '',
    dev_signals: {
      files,
      errors,
      commands,
      topics,
    },
    confidence: Math.round(confidence * 100) / 100,
    raw_ocr_available: rawOcr.length > 0,
  };
}

export function formatMirrorDevInfo(info: MirrorDevInfo): string {
  const lines = [
    '[MIRROR_DEV_INFO]',
    `ts=${info.ts}`,
    `surface=${info.surface}`,
    `app=${info.app}`,
    `title=${info.title}`,
  ];

  if (info.url) {
    lines.push(`url=${info.url}`);
  }

  lines.push('dev_signals:');
  lines.push(`- files: [${info.dev_signals.files.join(', ')}]`);
  lines.push(`- errors: [${info.dev_signals.errors.join(', ')}]`);
  lines.push(`- commands: [${info.dev_signals.commands.join(', ')}]`);
  lines.push(`- topics: [${info.dev_signals.topics.join(', ')}]`);
  lines.push(`confidence=${info.confidence}`);
  lines.push(`raw_ocr_available=${info.raw_ocr_available}`);

  return lines.join('\n');
}
