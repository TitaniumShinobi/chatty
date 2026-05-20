# Chatty CLI Commands Reference

This document provides a comprehensive reference for all slash commands available in Chatty CLI.

## Table of Contents

- [Core Commands](#core-commands)
- [Model Management](#model-management)
- [Memory & Status](#memory--status)
- [File Operations](#file-operations)
- [System Commands](#system-commands)

---

## Core Commands

### `/help`
**Description**: Display comprehensive help information about Chatty's capabilities and available commands.

**Usage**: 
```bash
/help
```

**Output**: Shows AI features, all available commands, and usage examples.

---

### `/clear`
**Description**: Clear the current conversation history from memory.

**Usage**:
```bash
/clear
```

**Output**: Confirmation message that conversation history has been cleared.

---

### `/exit`
**Description**: Exit the Chatty CLI application.

**Usage**:
```bash
/exit
```

**Output**: Goodbye message and application termination.

---

## Model Management

### `/model`
**Description**: Show the currently active AI model.

**Usage**:
```bash
/model
```

**Output**: Displays the name of the currently active model (e.g., "synth", "phi3", "deepseek-coder").

---

### `/model list`
**Description**: List all installed Ollama models on the system.

**Usage**:
```bash
/model list
```

**Output**: Executes `ollama list` command to show all available models.

---

### `/model <model_name>`
**Description**: Switch to a specific single-model mode.

**Usage**:
```bash
/model phi3
/model deepseek-coder
/model mistral
```

**Output**: Confirmation message showing the model has been switched.

---

### `/model synth`
**Description**: Enable multi-model synthesis mode (default mode).

**Usage**:
```bash
/model synth
```

**Output**: Confirmation that synth mode is enabled.

**Note**: Synth mode combines insights from multiple specialized models (coding, creative, smalltalk) for comprehensive responses.

---

### `/models`
**Description**: Show the specific models currently active in the synth pipeline.

**Usage**:
```bash
/models
```

**Output**: Displays the three models used in synth mode:
- **Coding**: deepseek-coder:latest
- **Creative**: mistral:latest  
- **Smalltalk**: phi3:latest

**Note**: Only works when synth mode is active.

---

## Memory & Status

### `/memory`
**Description**: Display memory system status and statistics.

**Usage**:
```bash
/memory
```

**Output**: Shows persistent memory statistics including:
- Number of stored messages
- Number of triples (knowledge relationships)
- Number of persona keys
- Memory type (SQLite persistent or in-memory)

---

### `/status`
**Description**: Display comprehensive runtime status information.

**Usage**:
```bash
/status
```

**Output**: Shows:
- Memory information (messages in history or persistent SQLite stats)
- Currently active model
- System status

---

## File Operations

### `/file`
**Description**: Access the comprehensive file operations system.

**Usage**:
```bash
/file help
```

**Output**: Shows detailed help for all file operation commands.

---

### Navigation Commands

#### `/file cd <path>`
**Description**: Change to a specified directory.

**Usage**:
```bash
/file cd /home/user
/file cd ../parent-directory
/file cd relative/path
```

**Output**: Confirmation of directory change or error message.

---

#### `/file pwd`
**Description**: Show the current working directory.

**Usage**:
```bash
/file pwd
```

**Output**: Full path of the current directory.

---

#### `/file ls [path]`
**Description**: List directory contents with detailed information.

**Usage**:
```bash
/file ls
/file ls /home/user
/file ls ../parent
```

**Output**: Detailed listing showing:
- File/directory icons (📁/📄)
- Names with color coding
- File sizes (formatted)
- Modification dates
- Permissions
- Symbolic link targets

---

### File Management Commands

#### `/file cp <source> <destination>`
**Description**: Copy files or directories.

**Usage**:
```bash
/file cp file.txt backup/
/file cp directory/ backup/ --recursive
/file cp file.txt backup/ --force
```

**Options**:
- `--recursive, -r`: Copy directories recursively
- `--force, -f`: Overwrite existing files

**Output**: Confirmation of successful copy or error message.

---

#### `/file mv <source> <destination>`
**Description**: Move or rename files and directories.

**Usage**:
```bash
/file mv oldname.txt newname.txt
/file mv file.txt /new/location/
/file mv file.txt /new/location/ --force
```

**Options**:
- `--force, -f`: Overwrite existing files

**Output**: Confirmation of successful move or error message.

---

### Symbolic Link Commands

#### `/file ln <source> <link_name>`
**Description**: Create symbolic links.

**Usage**:
```bash
/file ln /usr/bin/python3 py3
/file ln /path/to/file link_name
/file ln /path/to/file link_name --force
```

**Options**:
- `--force, -f`: Overwrite existing links

**Output**: Confirmation of link creation with target information.

---

#### `/file links [path]`
**Description**: List all symbolic links in a directory.

**Usage**:
```bash
/file links
/file links /home/user
```

**Output**: List of symbolic links showing:
- Link name
- Target path
- Full link path

---

### Search Commands

#### `/file grep <search_term> [path]`
**Description**: Search for text patterns in files.

**Usage**:
```bash
/file grep "function" src/
/file grep "error" . --recursive
/file grep "TODO" src/ --ignore-case --pattern "*.js"
/file grep "class" . --word --max-depth 3
```

**Options**:
- `--recursive, -r`: Search recursively through subdirectories
- `--ignore-case, -i`: Case-insensitive search
- `--word, -w`: Match whole words only
- `--pattern <regex>`: Filter files by pattern (e.g., "*.js", "*.ts")
- `--max-depth <n>`: Limit search depth

**Output**: Search results showing:
- File path
- Line number
- Matching line content
- Search term highlighted

---

#### `/file find <pattern> [path]`
**Description**: Find files by name pattern.

**Usage**:
```bash
/file find "*.js" src/
/file find "config*" . --recursive
/file find "*.log" /var/log --type file
/file find "test*" . --type directory --max-depth 2
```

**Options**:
- `--recursive, -r`: Search recursively
- `--type <file|directory|both>`: Filter by file type
- `--max-depth <n>`: Limit search depth

**Output**: List of matching files showing:
- File/directory icon
- Name
- Full path
- File size
- Modification date

---

### Information Commands

#### `/file info <path>`
**Description**: Get detailed information about a file or directory.

**Usage**:
```bash
/file info important-file.txt
/file info /path/to/directory
```

**Output**: Detailed information including:
- Full path
- Name
- Type (file/directory)
- Size (formatted)
- Permissions (readable format)
- Creation date
- Modification date
- Access date
- Owner and group IDs
- Symbolic link target (if applicable)

---

## System Commands

### `/ts`
**Description**: Toggle timestamp display for AI responses.

**Usage**:
```bash
/ts
```

**Output**: Confirmation that timestamps are enabled or disabled.

**Note**: When enabled, AI responses will include timestamps in the format `[MM/DD/YYYY, H:MM:SS AM/PM]`.

---

## Command Examples

### Basic Usage
```bash
# Get help
/help

# Check current model
/model

# Enable synth mode
/model synth

# Check synth pipeline models
/models

# View memory status
/memory

# Get system status
/status

# Clear conversation
/clear

# Exit application
/exit
```

### File Operations Examples
```bash
# Navigate and explore
/file pwd
/file ls
/file cd /home/user/projects

# Copy and move files
/file cp important.txt backup/
/file mv old_file.txt new_file.txt
/file cp directory/ backup/ --recursive

# Create symbolic links
/file ln /usr/bin/python3 py3
/file links

# Search for content
/file grep "TODO" src/ --recursive
/file grep "function" . --pattern "*.js" --ignore-case

# Find files
/file find "*.log" /var/log --type file
/file find "config*" . --recursive

# Get file information
/file info important-file.txt
```

### Advanced File Operations
```bash
# Complex searches
/file grep "error" . --recursive --pattern "*.{js,ts}" --max-depth 3
/file find "test*" src/ --type file --recursive

# File management with options
/file cp large_directory/ backup/ --recursive --force
/file mv temp_file.txt final_location/ --force
```

---

## Notes

- All commands are case-sensitive
- File paths can be relative or absolute
- Most file operations support both Unix-style paths and Windows-style paths
- Error messages provide helpful information about what went wrong
- The file operations system maintains its own working directory separate from the system shell
- All file operations include comprehensive error handling and safety checks
- Symbolic links are properly detected and displayed with their targets
- Search operations are optimized for performance and include proper escaping

---

## Integration

These commands integrate seamlessly with Chatty's AI capabilities. You can:

1. Use file operations to prepare data for AI analysis
2. Search through codebases and ask Chatty to explain findings
3. Navigate project structures and get AI assistance with file organization
4. Combine file operations with AI reasoning for complex tasks

The file operations system is designed to work alongside Chatty's multi-model synthesis capabilities, providing a complete development and analysis environment.
