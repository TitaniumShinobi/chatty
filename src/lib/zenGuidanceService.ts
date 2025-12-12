import type { GuidanceStep } from '../components/ZenGuidance'

/**
 * Service for managing Zen's contextual guidance pop-ups
 * Allows Zen to guide users through workflows and explain features
 */
class ZenGuidanceService {
  private listeners: Set<(step: GuidanceStep | null) => void> = new Set()
  private currentStep: GuidanceStep | null = null
  private steps: GuidanceStep[] = []
  private currentStepIndex: number = 0

  /**
   * Subscribe to guidance step changes
   */
  subscribe(listener: (step: GuidanceStep | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Show a single guidance step
   */
  showStep(step: GuidanceStep) {
    this.currentStep = step
    this.steps = [step]
    this.currentStepIndex = 0
    this.notifyListeners()
  }

  /**
   * Show a multi-step guidance flow
   */
  showFlow(steps: GuidanceStep[]) {
    if (steps.length === 0) return
    this.steps = steps
    this.currentStepIndex = 0
    this.currentStep = steps[0]
    this.notifyListeners()
  }

  /**
   * Move to next step in flow
   */
  nextStep() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++
      this.currentStep = this.steps[this.currentStepIndex]
      this.notifyListeners()
    } else {
      this.hide()
    }
  }

  /**
   * Move to previous step in flow
   */
  previousStep() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--
      this.currentStep = this.steps[this.currentStepIndex]
      this.notifyListeners()
    }
  }

  /**
   * Hide current guidance
   */
  hide() {
    this.currentStep = null
    this.steps = []
    this.currentStepIndex = 0
    this.notifyListeners()
  }

  /**
   * Get current step
   */
  getCurrentStep(): GuidanceStep | null {
    return this.currentStep
  }

  /**
   * Get current step index
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex
  }

  /**
   * Get total steps
   */
  getTotalSteps(): number {
    return this.steps.length
  }

  /**
   * Check if guidance is visible
   */
  isVisible(): boolean {
    return this.currentStep !== null
  }

  /**
   * Notify all listeners of step change
   */
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentStep))
  }

  /**
   * Create guidance for data import workflow
   */
  createDataImportGuidance(): GuidanceStep[] {
    return [
      {
        id: 'import-1',
        title: 'Import Your ChatGPT Conversations',
        content: 'I can help you import your ChatGPT conversations! Click the "Import" button below to get started.',
        targetElement: '[data-guidance="data-import-button"]',
        position: 'top',
        arrow: 'bottom',
        dismissible: true
      },
      {
        id: 'import-2',
        title: 'Select Your Archive',
        content: 'Choose the .zip file you exported from ChatGPT. I\'ll automatically detect and organize all your conversations.',
        position: 'center',
        dismissible: true
      },
      {
        id: 'import-3',
        title: 'Review Import Results',
        content: 'Once imported, your conversations will be organized by year and month. You can access them through the Address Book.',
        targetElement: '[data-guidance="address-book"]',
        position: 'left',
        arrow: 'right',
        dismissible: true
      }
    ]
  }

  /**
   * Create guidance for runtime dashboard
   */
  createRuntimeDashboardGuidance(): GuidanceStep[] {
    return [
      {
        id: 'runtime-1',
        title: 'Runtime Dashboard',
        content: 'The Runtime Dashboard shows all active runtimes and their status. Each runtime represents an imported data source or external connection.',
        targetElement: '[data-guidance="runtime-dashboard"]',
        position: 'bottom',
        arrow: 'top',
        dismissible: true
      }
    ]
  }
}

// Singleton instance
let instance: ZenGuidanceService | null = null

export function getZenGuidanceService(): ZenGuidanceService {
  if (!instance) {
    instance = new ZenGuidanceService()
  }
  return instance
}

export default ZenGuidanceService

