/**
 * Prompt Parser Utility
 * 
 * Centralized parsing logic for prompt.txt files.
 * Expected format:
 * Line 1: **You Are <NAME>**
 * Line 2: *<Description>*
 * Remaining: Instructions block (optionally wrapped in triple backticks ```)
 */

/**
 * Parse prompt.txt content into name, description, and instructions
 * @param {string} promptContent - Raw prompt.txt content
 * @returns {Object} { name, description, instructions }
 */
function parsePromptTxt(promptContent) {
  if (!promptContent || typeof promptContent !== 'string') {
    return { name: null, description: null, instructions: '' };
  }

  const lines = promptContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let name = null;
  let description = null;
  let instructions = '';

  // Line 1: **You Are <NAME>**
  if (lines.length > 0) {
    const firstLine = lines[0];
    // Match: **You Are <NAME>** (case-insensitive)
    const nameMatch = firstLine.match(/\*\*You Are\s+([^*]+)\*\*/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    } else {
      // Fallback: try to extract from any markdown header format
      const fallbackMatch = firstLine.match(/^#+\s*(.+)$/);
      if (fallbackMatch) {
        name = fallbackMatch[1].trim();
      } else if (firstLine.startsWith('**') && firstLine.endsWith('**')) {
        // Extract from **text** format
        name = firstLine.replace(/\*\*/g, '').trim();
      }
    }
  }

  // Line 2: *<Description>*
  if (lines.length > 1) {
    const secondLine = lines[1];
    // Match: *<Description>* (single asterisks for italics)
    const descMatch = secondLine.match(/^\*([^*]+)\*$/);
    if (descMatch) {
      description = descMatch[1].trim();
    } else {
      // Fallback: if line 2 doesn't match italics, check if it's a description without asterisks
      // (but only if line 1 was a name match)
      if (name && !secondLine.startsWith('**') && !secondLine.startsWith('#')) {
        description = secondLine;
      }
    }
  }

  // Remaining lines: Instructions
  // Instructions may be wrapped in triple backticks (```) or just plain text
  if (lines.length > 2) {
    let instructionLines = lines.slice(2);
    
    // Check if instructions are wrapped in triple backticks
    const firstInstr = instructionLines[0];
    const lastInstr = instructionLines[instructionLines.length - 1];
    
    if (firstInstr === '```' && lastInstr === '```' && instructionLines.length > 2) {
      // Strip the opening and closing triple backticks
      instructions = instructionLines.slice(1, -1).join('\n').trim();
    } else if (firstInstr === '```' && instructionLines.length > 1) {
      // Opening backtick but no closing (malformed, but handle gracefully)
      instructions = instructionLines.slice(1).join('\n').trim();
    } else {
      // No backticks, use all lines as-is
      instructions = instructionLines.join('\n').trim();
    }
  } else if (lines.length === 1 && !name) {
    // Fallback: if only one line and no name extracted, use it as instructions
    instructions = lines[0].replace(/\*\*/g, '').trim();
  } else if (lines.length === 2 && name && !description) {
    // Fallback: if two lines, first is name, second might be instructions
    instructions = lines[1].replace(/\*/g, '').trim();
  }

  return { name, description, instructions };
}

/**
 * Validate prompt.txt format and return warnings
 * @param {string} promptContent - Raw prompt.txt content
 * @returns {Object} { valid: boolean, warnings: string[] }
 */
function validatePromptFormat(promptContent) {
  const warnings = [];
  
  if (!promptContent || typeof promptContent !== 'string') {
    return { valid: false, warnings: ['Prompt content is empty or invalid'] };
  }

  const lines = promptContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Check for expected format
  if (lines.length === 0) {
    warnings.push('Prompt file is empty');
    return { valid: false, warnings };
  }

  // Check line 1 format
  if (lines.length > 0) {
    const firstLine = lines[0];
    const nameMatch = firstLine.match(/\*\*You Are\s+([^*]+)\*\*/i);
    if (!nameMatch) {
      warnings.push(`Line 1 does not match expected format "**You Are <NAME>**": "${firstLine.substring(0, 50)}"`);
    }
  }

  // Check line 2 format
  if (lines.length > 1) {
    const secondLine = lines[1];
    const descMatch = secondLine.match(/^\*([^*]+)\*$/);
    if (!descMatch) {
      warnings.push(`Line 2 does not match expected format "*<Description>*": "${secondLine.substring(0, 50)}"`);
    }
  }

  // Check if instructions are present
  if (lines.length <= 2) {
    warnings.push('No instructions block found (expected after line 2)');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}

module.exports = {
  parsePromptTxt,
  validatePromptFormat
};

