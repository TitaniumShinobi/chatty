import * as fs from "node:fs";
import * as path from "node:path";

describe("Layout VVAULT status source contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "Layout.tsx"),
    "utf8",
  );

  it("does not render the old page-wide VVAULT blocker copy", () => {
    expect(source).not.toContain("Connecting to VVAULT");
    expect(source).not.toContain("VVAULT authentication required");
    expect(source).not.toContain("VVAULT unavailable");
    expect(source).not.toContain("VVAULT auth required");
    expect(source).not.toContain("showVvaultStatus");
    expect(source).not.toContain("getVvaultUiStatusCopy");
    expect(source).not.toContain(
      "fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm",
    );
  });

  it("keeps VVAULT failures scoped while preserving the normal main shell", () => {
    expect(source).toContain("logScopedVvaultActionFailure");
    expect(source).toContain("[VVAULT_SCOPE_FAIL]");
    expect(source).toContain("<Outlet");
  });

  it("does not navigate locally after delegating logout to auth", () => {
    expect(source).toContain("await logout();");
    expect(source).not.toContain('await logout();\n    navigate("/")');
  });
});
