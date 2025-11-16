export const Z_LAYERS = {
  base: 0,
  content: 5,
  sidebarMuted: 8,
  sidebar: 20,
  popover: 40,
  floatingPanel: 45,
  overlay: 50,
  modal: 60,
  toast: 70,
  critical: 120
} as const

export type ZLayerKey = keyof typeof Z_LAYERS

export function getZIndex(layer: ZLayerKey, offset = 0) {
  return Z_LAYERS[layer] + offset
}
