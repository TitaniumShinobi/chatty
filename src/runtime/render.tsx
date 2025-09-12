// src/runtime/render.tsx
import React from 'react'

type Packet = { op: string; payload?: any }

function renderAnswer(pl: any) {
  if (typeof pl === 'string') return pl
  if (typeof pl?.content === 'string') return pl.content
  if (Array.isArray(pl)) return pl.join('\n')
  if (Array.isArray(pl?.content)) return pl.content.join('\n')
  return JSON.stringify(pl ?? '')
}

const RENDERERS: Record<string, (pl: any) => React.ReactNode> = {
  'answer.v1': (pl) => <span>{renderAnswer(pl)}</span>,
  'file.summary.v1': (pl) => (
    <div>
      📄 <strong>{pl?.fileName ?? '(unnamed)'}</strong>
      {pl?.summary ? <>: {pl.summary}</> : null}
    </div>
  ),
  'warn.v1': (pl) => <div>⚠️ {pl?.message ?? ''}</div>,
  'error.v1': (pl) => <div>❌ {pl?.message ?? ''}</div>,
}

function PacketView({ p }: { p: Packet }) {
  const fn = RENDERERS[p.op] || ((_pl) => <span>[missing-op: {p.op}]</span>)
  return <div>{fn(p.payload)}</div>
}

export function R({ packets }: { packets: Packet[] }) {
  if (!Array.isArray(packets) || packets.length === 0) {
    return <div style={{ opacity: 0.6 }}>[empty]</div>
  }
  return (
    <>
      {packets.map((p, i) => (
        <PacketView key={i} p={p} />
      ))}
    </>
  )
}

export default R