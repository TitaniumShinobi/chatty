import * as fs from "fs";
import * as path from "path";

describe("SettingsModal public MVP gating", () => {
  it("keeps unfinished settings tabs out of the visible sidebar list", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "./SettingsModal.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Apps & Connectors");
    expect(source).not.toContain("Parental Controls");
    expect(source).toContain("General");
    expect(source).toContain("Security");
    expect(source).toContain("Account");
  });
});
