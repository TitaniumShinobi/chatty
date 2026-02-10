import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowRight, ArrowDown, ArrowUp, ArrowLeft } from 'lucide-react'
import { Z_LAYERS } from '../lib/zLayers'

export interface GuidanceStep {
  id: string
  title: string
  content: string
  targetElement?: string // CSS selector for element to highlight/point to
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  arrow?: 'top' | 'bottom' | 'left' | 'right'
  action?: {
    label: string
    onClick: () => void
  }
  dismissible?: boolean
}

interface ZenGuidanceProps {
  isVisible: boolean
  step: GuidanceStep | null
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  currentStepIndex?: number
  totalSteps?: number
}

const ZenGuidance: React.FC<ZenGuidanceProps> = ({
  isVisible,
  step,
  onClose,
  onNext,
  onPrevious,
  currentStepIndex,
  totalSteps
}) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [arrowPosition, setArrowPosition] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isVisible || !step || !step.targetElement) {
      setPosition(null)
      return
    }

    const target = document.querySelector(step.targetElement)
    if (!target) {
      // Center if target not found
      setPosition({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2
      })
      setArrowPosition(null)
      return
    }

    const rect = target.getBoundingClientRect()
    const tooltipRect = tooltipRef.current?.getBoundingClientRect()
    const tooltipWidth = tooltipRect?.width || 320
    const tooltipHeight = tooltipRect?.height || 200

    let top = 0
    let left = 0
    let arrow: 'top' | 'bottom' | 'left' | 'right' | null = null

    switch (step.position || 'bottom') {
      case 'top':
        top = rect.top - tooltipHeight - 20
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        arrow = 'bottom'
        break
      case 'bottom':
        top = rect.bottom + 20
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        arrow = 'top'
        break
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.left - tooltipWidth - 20
        arrow = 'right'
        break
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.right + 20
        arrow = 'left'
        break
      case 'center':
        top = window.innerHeight / 2 - tooltipHeight / 2
        left = window.innerWidth / 2 - tooltipWidth / 2
        arrow = null
        break
    }

    // Keep tooltip within viewport
    top = Math.max(20, Math.min(top, window.innerHeight - tooltipHeight - 20))
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipWidth - 20))

    setPosition({ top, left })
    setArrowPosition(arrow || step.arrow || null)
  }, [isVisible, step])

  if (!isVisible || !step) return null

  const ArrowIcon = arrowPosition === 'top' ? ArrowDown :
                    arrowPosition === 'bottom' ? ArrowUp :
                    arrowPosition === 'left' ? ArrowRight :
                    arrowPosition === 'right' ? ArrowLeft : null

  return createPortal(
    <>
      {/* Overlay backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0"
        style={{
          zIndex: Z_LAYERS.modal - 1,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          pointerEvents: step.dismissible !== false ? 'auto' : 'none'
        }}
        onClick={step.dismissible !== false ? onClose : undefined}
      />

      {/* Highlight overlay for target element */}
      {step.targetElement && (
        <div
          className="fixed"
          style={{
            zIndex: Z_LAYERS.modal - 1,
            pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            ...(() => {
              const target = document.querySelector(step.targetElement!)
              if (!target) return { display: 'none' }
              const rect = target.getBoundingClientRect()
              return {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: '4px'
              }
            })()
          }}
        />
      )}

      {/* Guidance tooltip */}
      <div
        ref={tooltipRef}
        className="fixed rounded-lg shadow-xl"
        style={{
          zIndex: Z_LAYERS.modal,
          top: position?.top || '50%',
          left: position?.left || '50%',
          transform: position ? 'none' : 'translate(-50%, -50%)',
          backgroundColor: 'var(--chatty-bg-main)',
          border: '1px solid var(--chatty-line)',
          color: 'var(--chatty-text)',
          maxWidth: '400px',
          minWidth: '300px',
          padding: '20px'
        }}
      >
        {/* Arrow pointing to target */}
        {ArrowIcon && arrowPosition && (
          <div
            className="absolute"
            style={{
              [arrowPosition === 'top' ? 'bottom' : arrowPosition === 'bottom' ? 'top' : arrowPosition === 'left' ? 'right' : 'left']: '-12px',
              [arrowPosition === 'top' || arrowPosition === 'bottom' ? 'left' : 'top']: '50%',
              transform: arrowPosition === 'top' || arrowPosition === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)',
              color: 'var(--chatty-bg-main)'
            }}
          >
            <ArrowIcon size={24} fill="var(--chatty-bg-main)" stroke="var(--chatty-line)" strokeWidth={2} />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--chatty-text)' }}>
              {step.title}
            </h3>
            {currentStepIndex !== undefined && totalSteps && totalSteps > 1 && (
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Step {currentStepIndex + 1} of {totalSteps}
              </p>
            )}
          </div>
          {step.dismissible !== false && (
            <button
              onClick={onClose}
              className="p-1 rounded transition-colors hover:bg-[var(--chatty-highlight)]"
              style={{ color: 'var(--chatty-text)' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.9 }}>
          <p className="text-sm whitespace-pre-wrap">{step.content}</p>
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {onPrevious && currentStepIndex !== undefined && currentStepIndex > 0 && (
              <button
                onClick={onPrevious}
                className="px-3 py-1.5 text-sm rounded transition-colors hover:bg-[var(--chatty-highlight)]"
                style={{ color: 'var(--chatty-text)' }}
              >
                Previous
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step.action && (
              <button
                onClick={step.action.onClick}
                className="px-4 py-1.5 text-sm rounded transition-colors font-medium"
                style={{
                  backgroundColor: 'var(--chatty-button)',
                  color: 'var(--chatty-text)'
                }}
              >
                {step.action.label}
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                className="px-4 py-1.5 text-sm rounded transition-colors font-medium flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--chatty-button)',
                  color: 'var(--chatty-text)'
                }}
              >
                {currentStepIndex !== undefined && totalSteps && currentStepIndex < totalSteps - 1 ? 'Next' : 'Got it'}
                {currentStepIndex !== undefined && totalSteps && currentStepIndex < totalSteps - 1 && (
                  <ArrowRight size={14} />
                )}
              </button>
            )}
            {!onNext && step.dismissible !== false && (
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm rounded transition-colors font-medium"
                style={{
                  backgroundColor: 'var(--chatty-button)',
                  color: 'var(--chatty-text)'
                }}
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

export default ZenGuidance

