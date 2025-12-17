const fs = require('fs');

/**
 * Filters unnecessary details from chatty logs and writes cleaned logs to a new file.
 * @param {string} inputFilePath - Path to the input log file.
 * @param {string} outputFilePath - Path to the output cleaned log file.
 */
function filterChattyLogs(inputFilePath, outputFilePath) {
  const logData = fs.readFileSync(inputFilePath, 'utf-8');

  const filteredLogs = logData
    .split('\n')
    .filter((line) => {
      // Remove verbose timing logs
      if (line.includes('ms')) return false;

      // Remove repetitive parsing logs
      if (line.includes('Parsed conversation: {') || line.includes('Scanning directory')) return false;

      // Keep all other logs
      return true;
    })
    .map((line) => {
      // Simplify parsed conversation logs
      if (line.includes('Parsed conversation:')) {
        const match = line.match(/Parsed conversation: \{.*title: '(.*?)',.*messageCount: (\d+),/);
        if (match) {
          return `${line.split(' ')[0]} ✅ Parsed: ${match[1]} - ${match[2]} messages`;
        }
      }
      return line;
    })
    .join('\n');

  fs.writeFileSync(outputFilePath, filteredLogs, 'utf-8');
  console.log(`Filtered chatty logs written to ${outputFilePath}`);
}

// Example usage
// filterChattyLogs('path/to/chatty.log', 'path/to/chatty_cleaned.log');

module.exports = filterChattyLogs;