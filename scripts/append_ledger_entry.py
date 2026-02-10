#!/usr/bin/env python3
"""
Append the latest commit details to commits.md as a ledger entry.
Usage:
    python3 scripts/append_ledger_entry.py
"""
import os
import subprocess
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER_PATH = os.path.join(REPO_ROOT, 'commits.md')


def main():
    # Get commit timestamp
    timestamp = subprocess.check_output(
        ['git', 'log', '-1', '--format=%cd', '--date=format:%Y-%m-%d — %H:%M:%S'],
        cwd=REPO_ROOT
    ).decode().strip()
    # Get commit summary
    summary = subprocess.check_output(
        ['git', 'log', '-1', '--format=%s'],
        cwd=REPO_ROOT
    ).decode().strip()
    # Get list of files in the commit
    files = subprocess.check_output(
        ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
        cwd=REPO_ROOT
    ).decode().splitlines()
    files_list = ', '.join(files)

    entry = (
        f"### [{timestamp}]\n"
        f"**Project:** Chatty\n"
        f"**Files Edited:** {files_list}\n"
        f"**Type:** Code Change\n"
        f"**Summary:** {summary}\n"
        f"**Reason for Change:** \n"
        f"**Impact:**\n"
        "- ✅ \n"
        "- ⚠️ \n"
        "- ❌ \n\n"
        "---\n\n"
    )
    with open(LEDGER_PATH, 'a') as ledger:
        ledger.write(entry)
    print(f"Appended ledger entry for commit: {summary}")


if __name__ == '__main__':
    main()
