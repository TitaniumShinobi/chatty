describe('vvault path helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('expands home directories in configured VVAULT paths', async () => {
    process.env.VVAULT_ROOT_PATH = '~/Documents/GitHub/vvault';
    const { execFileSync } = await import('node:child_process');

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { getVvaultBasePath } from './server/lib/vvaultPaths.js'; console.log(JSON.stringify({ path: getVvaultBasePath() }));",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, VVAULT_ROOT_PATH: '~/Documents/GitHub/vvault' },
        encoding: 'utf8',
      },
    );

    const parsed = JSON.parse(output.trim());
    expect(parsed.path).toContain('/Documents/GitHub/vvault');
    expect(parsed.path.startsWith('~/')).toBe(false);
  });

  it('finds construct identity in flat local instances layout', async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-vvault-'));
    const identityDir = path.join(tmpRoot, 'instances', 'lin-001', 'identity');
    await fs.mkdir(identityDir, { recursive: true });
    await fs.writeFile(path.join(identityDir, 'prompt.txt'), 'You are Lin.');

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { findConstructIdentityDir } from './server/lib/vvaultPaths.js'; const result = await findConstructIdentityDir({ constructId: 'lin-001', userId: 'system' }); console.log(JSON.stringify({ result }));",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, VVAULT_ROOT_PATH: tmpRoot },
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(output.trim());

    expect(parsed.result).toBe(identityDir);
  });
});
