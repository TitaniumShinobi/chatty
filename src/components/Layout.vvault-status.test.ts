import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Layout logout handoff', () => {
  it('lets logout own navigation instead of routing back to Home immediately', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Layout.tsx'), 'utf8');
    expect(source).toContain('await logout();');
    expect(source).not.toMatch(/await logout\(\);\s*navigate\(["']\/["']\)/);
  });
});
