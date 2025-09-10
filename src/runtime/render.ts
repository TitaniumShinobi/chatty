import { STR } from "./dict";

export type Seg = number | { join: number[] } | { br: true } | { text: string };

export function R(...segs: Seg[]): string {
	const out: string[] = [];
	for (const s of segs) {
		if (typeof s === "number") {
			out.push(STR[s] ?? `⟂${s}`);
		} else if ("join" in s) {
			out.push(s.join.map((id) => STR[id] ?? `⟂${id}`).join(" "));
		} else if ("br" in s) {
			out.push("\n");
		} else if ("text" in s) {
			out.push(s.text);
		}
	}
	return out.join(" ");
}

// Helper functions for common patterns
export function renderMessage(tokenId: number, ...args: (number | string)[]): string {
	const parts = [tokenId];
	for (const arg of args) {
		if (typeof arg === "number") {
			parts.push(arg);
		} else {
			parts.push({ text: arg });
		}
	}
	return R({ join: parts });
}

export function renderWithBreak(tokenId: number, breakToken?: number): string {
	if (breakToken) {
		return R(tokenId, { br: true }, breakToken);
	}
	return R(tokenId, { br: true });
}