// src/runtime/render.tsx
import React from "react";
import { DICT } from "./dict";
import type { AssistantPacket } from "../types";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function interpolate(template: string, payload: Record<string, any>): string {
  return template
    // positional {0}
    .replace(/\{(\d+)\}/g, (_m, i) => String(payload[i] ?? ""))
    // plural helper {count|s}
    .replace(/\{(\w+)\|s\}/g, (_m, k) => {
      const n = Number(payload[k]);
      return Number.isFinite(n) ? (n === 1 ? "" : "s") : "";
    })
    // nested properties {key.subkey.index} or {key.0}
    .replace(/\{([\w.]+)\}/g, (_m, path) => {
      const value = getNestedValue(payload, path);
      return String(value ?? "");
    });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    // Handle array indices
    if (!isNaN(Number(key))) {
      return current[Number(key)];
    }
    // Handle object properties
    return current[key];
  }, obj);
}

export function R({ packets }: { packets: AssistantPacket[] }) {
  return (
    <>
      {packets.map((p, i) => {
        const options = DICT[p.op];
        if (!options) return <div key={i}>[MISSING:{p.op}]</div>;
        const tmpl = Array.isArray(options) ? pick(options) : options;
        
        // Handle both payload formats for answer.v1
        let payload = p.payload;
        if (p.op === "answer.v1" && Array.isArray(payload)) {
          // Convert array format to object format for interpolation
          payload = { contentKeys: payload };
        }
        
        const line = interpolate(tmpl, { ...payload });
        return (
          <div key={i} style={{ whiteSpace: "pre-wrap" }}>
            {line}
          </div>
        );
      })}
    </>
  );
}
