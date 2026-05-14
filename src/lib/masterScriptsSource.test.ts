import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("master scripts browser bootstrap source guard", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/masterScripts.ts"), "utf8");

  it("keeps public browser bootstrap opt-in only", () => {
    expect(source).toContain("VITE_ENABLE_MASTER_SCRIPTS_BOOTSTRAP");
    expect(source).toContain('=== "true"');
  });

  it("guards unavailable admin route responses before parsing JSON", () => {
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("bootstrap_http_${response.status}");
    expect(source.indexOf("if (!response.ok)")).toBeLessThan(
      source.indexOf("return await response.json()"),
    );
  });
});
