import * as fs from 'node:fs';
import * as path from 'node:path';

describe('master scripts production mount contract', () => {
  const repoRoot = process.cwd();
  const serverSource = fs.readFileSync(path.join(repoRoot, 'server', 'server.js'), 'utf8');
  const routeSource = fs.readFileSync(
    path.join(repoRoot, 'server', 'routes', 'masterScripts.js'),
    'utf8',
  );

  it('mounts /api/master unconditionally in server setup', () => {
    expect(serverSource).toContain('app.use("/api/master", requireAuth, masterScriptsRoutes);');
    expect(serverSource).not.toMatch(
      /if\s*\(\s*process\.env\.ENABLE_MASTER_SCRIPTS\s*===\s*['"]true['"]\s*\)\s*\{\s*app\.use\("\/api\/master"/,
    );
  });

  it('supports GET /api/master/bootstrap in the mounted router', () => {
    expect(routeSource).toContain("router.get('/bootstrap', handleBootstrap);");
    expect(routeSource).toContain("router.post('/bootstrap', handleBootstrap);");
  });
});
