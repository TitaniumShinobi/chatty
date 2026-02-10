const MONTHS = {
  'january': '01', 'jan': '01',
  'february': '02', 'feb': '02',
  'march': '03', 'mar': '03',
  'april': '04', 'apr': '04',
  'may': '05',
  'june': '06', 'jun': '06',
  'july': '07', 'jul': '07',
  'august': '08', 'aug': '08',
  'september': '09', 'sep': '09', 'sept': '09',
  'october': '10', 'oct': '10',
  'november': '11', 'nov': '11',
  'december': '12', 'dec': '12'
};

const DATE_PATTERNS = [
  {
    name: 'iso_datetime',
    regex: /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/g,
    confidence: 1.0,
    extract: (match) => ({ year: match[1], month: match[2], day: match[3], time: `${match[4]}:${match[5]}:${match[6]}` })
  },
  {
    name: 'iso_date',
    regex: /(\d{4})-(\d{2})-(\d{2})/g,
    confidence: 1.0,
    extract: (match) => ({ year: match[1], month: match[2], day: match[3] })
  },
  {
    name: 'crash_log',
    regex: /crash-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.log/g,
    confidence: 1.0,
    extract: (match) => ({ year: match[1], month: match[2], day: match[3], time: `${match[4]}:${match[5]}:${match[6]}` })
  },
  {
    name: 'natural_full',
    regex: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/gi,
    confidence: 0.9,
    extract: (match) => {
      const monthNum = MONTHS[match[1].toLowerCase()];
      return { year: match[3], month: monthNum, day: match[2].padStart(2, '0') };
    }
  },
  {
    name: 'natural_abbrev',
    regex: /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/gi,
    confidence: 0.9,
    extract: (match) => {
      const monthNum = MONTHS[match[1].toLowerCase()];
      return { year: match[3], month: monthNum, day: match[2].padStart(2, '0') };
    }
  },
  {
    name: 'us_format_slash',
    regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
    confidence: 0.8,
    extract: (match) => ({ year: match[3], month: match[1].padStart(2, '0'), day: match[2].padStart(2, '0') })
  },
  {
    name: 'us_format_dash',
    regex: /(\d{1,2})-(\d{1,2})-(\d{4})/g,
    confidence: 0.8,
    extract: (match) => ({ year: match[3], month: match[1].padStart(2, '0'), day: match[2].padStart(2, '0') })
  },
  {
    name: 'year_month_day_underscores',
    regex: /(\d{4})_(\d{2})_(\d{2})/g,
    confidence: 0.8,
    extract: (match) => ({ year: match[1], month: match[2], day: match[3] })
  }
];

function extractStartDate(content, filename = '') {
  const startTime = Date.now();
  const sample = content.slice(0, 5000);
  
  const candidates = [];
  
  for (const pattern of DATE_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(sample)) !== null) {
      try {
        const extracted = pattern.extract(match);
        if (extracted && isValidDate(extracted)) {
          candidates.push({
            date: `${extracted.year}-${extracted.month}-${extracted.day}`,
            time: extracted.time || null,
            confidence: pattern.confidence,
            source: 'content',
            pattern: pattern.name,
            position: match.index
          });
        }
      } catch (e) {
      }
    }
  }
  
  if (filename) {
    for (const pattern of DATE_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(filename)) !== null) {
        try {
          const extracted = pattern.extract(match);
          if (extracted && isValidDate(extracted)) {
            candidates.push({
              date: `${extracted.year}-${extracted.month}-${extracted.day}`,
              time: extracted.time || null,
              confidence: pattern.confidence * 0.9,
              source: 'filename',
              pattern: pattern.name,
              position: 0
            });
          }
        } catch (e) {
        }
      }
    }
  }
  
  if (candidates.length === 0) {
    return { 
      startDate: null, 
      confidence: 0, 
      source: null,
      processingTimeMs: Date.now() - startTime 
    };
  }
  
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return new Date(a.date) - new Date(b.date);
  });
  
  const best = candidates[0];
  
  return {
    startDate: best.date,
    startTime: best.time,
    confidence: best.confidence,
    source: best.source,
    pattern: best.pattern,
    allCandidates: candidates.slice(0, 5),
    processingTimeMs: Date.now() - startTime
  };
}

function isValidDate(extracted) {
  const year = parseInt(extracted.year);
  const month = parseInt(extracted.month);
  const day = parseInt(extracted.day);
  
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  return true;
}

function extractFromPath(path) {
  const result = { platform: null, year: null, month: null, startDate: null };
  
  const parts = path.split('/').filter(p => p && !p.startsWith('.'));
  
  const platforms = ['chatgpt', 'gemini', 'grok', 'copilot', 'claude', 'chai', 
                     'character.ai', 'deepseek', 'codex', 'github_copilot'];
  
  for (const part of parts) {
    const lower = part.toLowerCase().replace(/\s+/g, '_');
    
    if (/^\d{4}$/.test(part)) {
      result.year = part;
    } else if (MONTHS[lower]) {
      result.month = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    } else if (platforms.includes(lower)) {
      result.platform = lower;
    }
  }
  
  if (result.year && result.month) {
    const monthNum = MONTHS[result.month.toLowerCase()];
    if (monthNum) {
      result.startDate = `${result.year}-${monthNum}-01`;
    }
  }
  
  return result;
}

export {
  extractStartDate,
  extractFromPath,
  DATE_PATTERNS,
  MONTHS
};
