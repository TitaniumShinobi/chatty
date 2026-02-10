/**
 * Modal Component Template
 * 
 * This is a template for creating new blocking modals in Chatty.
 * Copy this template and follow all requirements in MODAL_IMPLEMENTATION_GUIDE.md
 * 
 * Requirements:
 * 1. MUST use createPortal to render at document.body
 * 2. MUST use Z_LAYERS.critical (120) for backdrop
 * 3. MUST have proper pointer-events
 * 4. MUST be added to hasBlockingOverlay in Layout.tsx
 */

import React from 'react'
import { createPortal } from 'react-dom'
import { Z_LAYERS } from '../../lib/zLayers'

interface MyModalProps {
  isVisible: boolean
  onClose: () => void
  // Add other props as needed
}

export const MyModal: React.FC<MyModalProps> = ({ isVisible, onClose }) => {
  // Early return if not visible
  if (!isVisible) return null

  // REQUIRED: Use createPortal to render at document.body
  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
      style={{ 
        zIndex: Z_LAYERS.critical,  // REQUIRED: Use critical z-index
        isolation: 'isolate',
        pointerEvents: 'auto'  // REQUIRED: Block clicks
      }}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Modal Content */}
      <div
        className="rounded-lg w-full max-w-2xl bg-[var(--chatty-bg-main)] shadow-lg"
        style={{
          position: 'relative',
          zIndex: Z_LAYERS.critical + 1,  // REQUIRED: Content above backdrop
          pointerEvents: 'auto'
        }}
        onClick={(e) => {
          // REQUIRED: Stop propagation to prevent backdrop click
          e.stopPropagation()
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--chatty-line)]">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
            Modal Title
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--chatty-highlight)]"
            style={{ color: 'var(--chatty-text)' }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4" style={{ color: 'var(--chatty-text)' }}>
          {/* Your modal content here */}
        </div>

        {/* Footer (if needed) */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--chatty-line)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg"
            style={{ 
              backgroundColor: 'var(--chatty-button)', 
              color: 'var(--chatty-text)' 
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body  // REQUIRED: Portal to body
  )
}

