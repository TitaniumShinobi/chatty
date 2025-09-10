#!/usr/bin/env python3
"""
Generate a visual project map snapshot with module paths, last edit timestamps, and health status.
Usage:
    python3 scripts/project_map.py
"""
import os
import subprocess
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(REPO_ROOT, 'project_map.md')
IGNORE_DIRS = {'.git', 'node_modules'}


def get_modules(path):
    return [name for name in os.listdir(path)
            if os.path.isdir(os.path.join(path, name)) and name not in IGNORE_DIRS]


def get_last_commit_date(path):
    try:
        date = subprocess.check_output(
            ['git', 'log', '-1', '--format=%cd', '--', path],
            cwd=REPO_ROOT
        ).decode('utf-8').strip()
        return date
    except subprocess.CalledProcessError:
        return 'N/A'


def get_health_status(path):
    status = subprocess.check_output(
        ['git', 'status', '--porcelain', path],
        cwd=REPO_ROOT
    ).decode('utf-8').strip()
    return '⚠️ drift' if status else '✅ stable'


def main():
    modules = get_modules(REPO_ROOT)
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    lines = [
        '# Project Map Snapshot',
        f'Generated: {now}',
        '',
        '| Module Path | Last Edit | Health |',
        '|-------------|-----------|--------|',
    ]
    for module in modules:
        last_edit = get_last_commit_date(module)
        health = get_health_status(module)
        lines.append(f'| {module} | {last_edit} | {health} |')
    content = '\n'.join(lines) + '\n'
    with open(OUTPUT_PATH, 'w') as f:
        f.write(content)
    print(f'Project map snapshot written to {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
