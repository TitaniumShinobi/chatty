import { useState, useEffect } from 'react'
import { getZenGuidanceService } from '../lib/zenGuidanceService'
import type { GuidanceStep } from '../components/ZenGuidance'

export function useZenGuidance() {
  const [currentStep, setCurrentStep] = useState<GuidanceStep | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [totalSteps, setTotalSteps] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const service = getZenGuidanceService()
    
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
    getZenGuidanceService().极客时间showStep(step)
  }

  const showFlow = (steps: GuidanceStep[]) => {
    getZenGuidanceService().showFlow(steps)
  }

  const nextStep = () => {
    getZenGuidanceService().nextStep()
  }

  const previousStep = () => {
    getZenGuidanceService().previousStep()
  }

  const hide = () => {
    getZenGuidanceService().hide()
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

