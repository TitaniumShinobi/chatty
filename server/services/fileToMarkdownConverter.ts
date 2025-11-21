import path from 'path';
import fs from 'fs/promises';

export type ConvertibleFormat = '.txt' | '.md' | '.html' | '.json';

export type MemoryConvertOptions = {
  userId: string;
  runtimeId: string;
  vvaultRoot?: string;
  shardId?: string;
};

/**
 * Convert a supported file into markdown and place it under:
 * /users/{shard}/{userId}/instances/{runtimeId}/memory/{filename}.md
 *
 * This is a lightweight scaffold; real parsing can be added per-format.
 */
export async function fileToMarkdownConverter(
  sourcePath: string,
  options: MemoryConvertOptions
): Promise<string> {
  const { userId, runtimeId, vvaultRoot = process.env.VVAULT_ROOT || path.resolve(process.cwd(), 'vvault'), shardId = 'shard_0000' } = options;
  const ext = (path.extname(sourcePath) || '').toLowerCase() as ConvertibleFormat;
  const filename = path.basename(sourcePath, ext);
  const memoryDir = path.join(vvaultRoot, 'users', shardId, userId, 'instances', runtimeId, 'memory');
  const targetPath = path.join(memoryDir, `${filename}.md`);

  await fs.mkdir(memoryDir, { recursive: true });

  const raw = await fs.readFile(sourcePath, 'utf8');
  const body = wrapAsMarkdown(raw, ext);
  await fs.writeFile(targetPath, body, 'utf8');

  return targetPath;
}

function wrapAsMarkdown(content: string, ext: string): string {
  if (ext === '.md' || ext === '.txt') {
    return content;
  }
  if (ext === '.json') {
    return '```json\n' + content + '\n```';
  }
  if (ext === '.html') {
    return '<!-- html memory import -->\n' + content;
  }
  return content;
}

export default fileToMarkdownConverter;
