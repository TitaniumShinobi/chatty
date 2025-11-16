import { useState, useEffect } from 'react'
import { getSynthGuidanceService } from '../lib/synthGuidanceService'
import type { GuidanceStep } from '../components/SynthGuidance'

export function useSynthGuidance() {
  const [currentStep, setCurrentStep] = useState<GuidanceStep | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [totalSteps, setTotalSteps] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const service = getSynthGuidanceService()
    
    const unsubscribe = service.subscribe((step) => {
      setCurrentStep(step)
      setCurrentStepIndex(service.getCurrentStepIndex())
      setTotalSteps(service.getTotalSteps())
      setIsVisible(service.isVisible())
    })

    // Initialize state
    setCurrentStep(service.getCurrentStep())
    setCurrentStepIndex(service.getCurrentStepIndex())
    setTotalSteps(service.getTotalSteps())
    setIsVisible(service.isVisible())

    return unsubscribe
  }, [])

  const showStep = (step: GuidanceStep) => {
    getSynthGuidanceService().showStep(step)
  }

  const showFlow = (steps: GuidanceStep[]) => {
    getSynthGuidanceService().showFlow(steps)
  }

  const nextStep = () => {
    getSynthGuidanceService().nextStep()
  }

  const previousStep = () => {
    getSynthGuidanceService().previousStep()
  }

  const hide = () => {
    getSynthGuidanceService().hide()
  }

  return {
    currentStep,
    currentStepIndex,
    totalSteps,
    isVisible,
    showStep,
    showFlow,
    nextStep,
    previousStep,
    hide
  }
}

