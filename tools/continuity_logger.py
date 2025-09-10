#!/usr/bin/env python3
"""
Continuity Logger for Chatty

Append every step into a Markdown ledger (commits.md) with optional git diff and file snapshots.

Usage:
    python3 tools/continuity_logger.py --note "Start TaskRunner" --git --snapshot
    python3 tools/continuity_logger.py --note "Edit notifier" --include corefiles/notifier.py

Env:
    VX_CONTINUITY_FILE      Path to ledger (default: commits.md)
    VX_MAX_DIFF_BYTES       Max bytes to include from git diff
    VX_MAX_FILE_BYTES       Max bytes to snapshot per file
"""
import os
import sys
import argparse
import subprocess
from datetime import datetime
import hashlib

# Configuration
LEDGER_FILE = os.getenv('VX_CONTINUITY_FILE', 'commits.md')
MAX_DIFF = int(os.getenv('VX_MAX_DIFF_BYTES', '10000'))
MAX_FILE = int(os.getenv('VX_MAX_FILE_BYTES', '5000'))


def get_git_diff(files=None):
    # Skip diff if not inside a Git repo
    try:
        inside = subprocess.check_output(
            ['git', 'rev-parse', '--is-inside-work-tree'], cwd=REPO_ROOT
        ).decode('utf-8').strip()
        if inside != 'true':
            return ''
    except Exception:
        return ''
    # Only show changed lines without surrounding context
    cmd = ['git', 'diff', '--no-color', '-U0']
    if files:
        cmd += ['--'] + files
    try:
        diff = subprocess.check_output(cmd).decode('utf-8', errors='ignore')
        return diff[:MAX_DIFF]
    except Exception:
        return ''


def append_entry(note, files=None, snapshot=False, include=None):
    timestamp = datetime.now().strftime('%Y-%m-%d — %H:%M:%S')
    files_list = ', '.join(files) if files else ''
    entry = [f"### [{timestamp}]", f"**Project:** Chatty", f"**Note:** {note}"]
    if files_list:
        entry.append(f"**Files:** {files_list}")
    if args.git:
        diff = get_git_diff(files)
        if diff:
            entry.append('**Changed Lines:**')
            entry.append(f"```diff\n{diff}\n```")
    # full snapshots removed: use git diff for changed lines
    entry.append('---\n')
    with open(LEDGER_FILE, 'a') as f:
        f.write('\n'.join(entry) + '\n')
    print(f"Appended to {LEDGER_FILE}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Continuity Logger for Chatty')
    parser.add_argument('--note', required=True, help='Short description of this step')
    parser.add_argument('--git', action='store_true', help='Include git diff')
    parser.add_argument('--snapshot', action='store_true', help='Include file snapshots')
    parser.add_argument('--include', nargs='+', help='Files to snapshot')
    args = parser.parse_args()

    append_entry(args.note, files=None if not args.git else [], snapshot=args.snapshot, include=args.include)
