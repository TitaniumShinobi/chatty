export function canonicalizeConstructId(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  let value = input.trim().toLowerCase();
  if (!value) return "";

  if (value.includes("_chat_with_")) {
    const [lhsRaw, rhsRaw] = value.split("_chat_with_");
    const lhs = (lhsRaw || "").trim();
    const rhs = (rhsRaw || "").trim();
    if (!lhs && rhs) {
      value = rhs;
    } else if (!rhs) {
      value = lhs;
    } else if (!/-\d+$/.test(lhs) && /-\d+$/.test(rhs)) {
      value = rhs;
    } else {
      value = lhs;
    }
  }

  value = value.replace(/^gpt-/, "");
  value = value.replace(/-seed(?:-\d+)?$/, "");
  value = value.replace(/_+/g, "-");
  value = value.replace(/-+/g, "-");
  value = value.replace(/^-|-$/g, "");

  if (!value) return "";

  if (!/-\d+$/.test(value)) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      value = `${value}-001`;
    }
  }

  return value;
}

export function canonicalConstructId(id: string): string {
  return canonicalizeConstructId(id) || "construct-001";
}
