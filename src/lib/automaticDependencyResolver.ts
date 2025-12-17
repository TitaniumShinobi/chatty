/**
 * Automatic Dependency Resolver
 * 
 * Implements comprehensive automatic dependency resolution for runtime orchestration.
 * Ensures all runtime dependencies are managed by orchestration without manual intervention.
 */

import { AutomaticRuntimeOrchestrator, RuntimeAssignment } from './automaticRuntimeOrchestrator';
import { RuntimeContextManager } from './runtimeContextManager';
import { createGPTManager, type IGPTManager } from './gptManagerFactory';

import { shouldUseBrowserStubs, createBrowserSafeDependencyResolver } from './browserStubs';

export interface DependencyResolutionContext {
  threadId: string;
  userId: string;
  userMessage?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  requiredCapabilities?: string[];
  performanceRequirements?: {
    maxResponseTime?: number;
    minAccuracy?: number;
    preferredModel?: string;
  };
}

export interface ResolvedDependencies {
  runtimeAssignment: RuntimeAssignment;
  modelConfiguration: {
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  contextConfiguration: {
    memoryEnabled: boolean;
    workspaceContextEnabled: boolean;
    personalityEnabled: boolean;
  };
  performanceMetrics: {
    expectedResponseTime: number;
    confidenceScore: number;
    fallbackOptions: RuntimeAssignment[];
  };
}

export interface DependencyConflict {
  type: 'capability_mismatch' | 'performance_conflict' | 'resource_unavailable' | 'configuration_error';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolution: string;
  alternativeOptions?: RuntimeAssignment[];
}

export class AutomaticDependencyResolver {
  private static instance: AutomaticDependencyResolver;
  private runtimeOrchestrator: AutomaticRuntimeOrchestrator;
  private contextManager: RuntimeContextManager;
  private gptManager: IGPTManager | null = null;

  private dependencyCache: Map<string, ResolvedDependencies> = new Map();
  private conflictHistory: Map<string, DependencyConflict[]> = new Map();
  private isBrowserEnvironment: boolean;

  private constructor() {
    this.isBrowserEnvironment = shouldUseBrowserStubs();

    this.runtimeOrchestrator = AutomaticRuntimeOrchestrator.getInstance();
    this.contextManager = RuntimeContextManager.getInstance();


    if (!this.isBrowserEnvironment) {
      this.initializeGPTManager();
    }
  }

  static getInstance(): AutomaticDependencyResolver {
    if (!AutomaticDependencyResolver.instance) {
      // In browser environment, return browser stub instead
      if (shouldUseBrowserStubs()) {
        return createBrowserSafeDependencyResolver() as any;
      }

      AutomaticDependencyResolver.instance = new AutomaticDependencyResolver();
    }
    return AutomaticDependencyResolver.instance;
  }

  private async initializeGPTManager(): Promise<void> {
    if (!this.isBrowserEnvironment) {
      try {
        this.gptManager = await createGPTManager();
      } catch (error) {
        console.error('[AutomaticDependencyResolver] Failed to initialize GPTManager:', error);
        this.gptManager = null;
      }
    }
  }

  /**
   * Resolve all dependencies for a conversation automatically
   */
  async resolveDependencies(context: DependencyResolutionContext): Promise<ResolvedDependencies> {
    const cacheKey = this.generateCacheKey(context);

    // Check cache first
    const cached = this.dependencyCache.get(cacheKey);
    if (cached && this.isCacheValid(cached, context)) {
      console.log(`[AutomaticDependencyResolver] Using cached dependencies for ${context.threadId}`);
      return cached;
    }

    try {
      // Step 1: Resolve runtime assignment
      const runtimeAssignment = await this.resolveRuntimeAssignment(context);

      // Step 2: Resolve model configuration
      const modelConfiguration = await this.resolveModelConfiguration(runtimeAssignment, context);

      // Step 3: Resolve context configuration
      const contextConfiguration = await this.resolveContextConfiguration(runtimeAssignment, context);

      // Step 4: Calculate performance metrics
      const performanceMetrics = await this.calculatePerformanceMetrics(runtimeAssignment, context);

      // Step 5: Validate dependencies and detect conflicts
      const conflicts = await this.detectDependencyConflicts(runtimeAssignment, modelConfiguration, contextConfiguration);

      if (conflicts.length > 0) {
        const resolved = await this.resolveDependencyConflicts(conflicts, context);
        return resolved;
      }

      const resolvedDependencies: ResolvedDependencies = {
        runtimeAssignment,
        modelConfiguration,
        contextConfiguration,
        performanceMetrics
      };

      // Cache the resolved dependencies
      this.dependencyCache.set(cacheKey, resolvedDependencies);

      console.log(`[AutomaticDependencyResolver] Resolved dependencies for ${context.threadId}:`, {
        runtime: runtimeAssignment.constructId,
        model: modelConfiguration.modelId,
        confidence: Math.round(runtimeAssignment.confidence * 100) + '%'
      });

      return resolvedDependencies;

    } catch (error) {
      console.error('[AutomaticDependencyResolver] Failed to resolve dependencies:', error);

      // Fallback to safe defaults
      return this.getFallbackDependencies(context);
    }
  }

  /**
   * Resolve runtime assignment with dependency awareness
   */
  private async resolveRuntimeAssignment(context: DependencyResolutionContext): Promise<RuntimeAssignment> {
    // Check if thread already has a runtime assignment
    const existingAssignment = this.contextManager.getActiveRuntime(context.threadId);

    if (existingAssignment) {
      // Validate existing assignment is still optimal
      const isStillOptimal = await this.validateRuntimeAssignment(existingAssignment, context);
      if (isStillOptimal) {
        return existingAssignment;
      }
    }

    // Determine new optimal runtime
    const assignment = await this.runtimeOrchestrator.determineOptimalRuntime({
      userMessage: context.userMessage,
      conversationHistory: context.conversationHistory,
      userId: context.userId,
      threadId: context.threadId,
      existingConstructId: existingAssignment?.constructId
    });

    // Assign to thread automatically
    await this.contextManager.assignRuntimeToThread(
      context.threadId,
      assignment,
      context.userId
    );

    return assignment;
  }

  /**
   * Resolve model configuration based on runtime and requirements
   */
  private async resolveModelConfiguration(
    runtimeAssignment: RuntimeAssignment,
    context: DependencyResolutionContext
  ): Promise<ResolvedDependencies['modelConfiguration']> {
    try {
      // Get GPT configuration if available
      let gptConfig = null;
      if (runtimeAssignment.gptId && this.gptManager) {
        gptConfig = await this.gptManager.getGPT(runtimeAssignment.gptId);
      }

      // Determine optimal model based on requirements
      let modelId = 'gpt-4'; // Default fallback
      let temperature = 0.7;
      let maxTokens = 2000;

      if (gptConfig) {
        modelId = gptConfig.modelId || gptConfig.conversationModel || modelId;
        temperature = this.determineOptimalTemperature(context, gptConfig);
        maxTokens = this.determineOptimalMaxTokens(context, gptConfig);
      } else {
        // Determine model based on runtime type and requirements
        modelId = this.selectModelForRuntime(runtimeAssignment, context);
        temperature = this.determineTemperatureForContext(context);
        maxTokens = this.determineMaxTokensForContext(context);
      }

      // Apply performance requirements
      if (context.performanceRequirements?.preferredModel) {
        modelId = context.performanceRequirements.preferredModel;
      }

      return {
        modelId,
        temperature,
        maxTokens,
        systemPrompt: gptConfig?.instructions
      };

    } catch (error) {
      console.warn('[AutomaticDependencyResolver] Failed to resolve model configuration, using defaults:', error);
      return {
        modelId: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000
      };
    }
  }

  /**
   * Resolve context configuration based on runtime capabilities
   */
  private async resolveContextConfiguration(
    runtimeAssignment: RuntimeAssignment,
    context: DependencyResolutionContext
  ): Promise<ResolvedDependencies['contextConfiguration']> {
    // Determine what context features should be enabled
    const memoryEnabled = this.shouldEnableMemory(runtimeAssignment, context);
    const workspaceContextEnabled = this.shouldEnableWorkspaceContext(runtimeAssignment, context);
    const personalityEnabled = this.shouldEnablePersonality(runtimeAssignment, context);

    return {
      memoryEnabled,
      workspaceContextEnabled,
      personalityEnabled
    };
  }

  /**
   * Calculate expected performance metrics
   */
  private async calculatePerformanceMetrics(
    runtimeAssignment: RuntimeAssignment,
    context: DependencyResolutionContext
  ): Promise<ResolvedDependencies['performanceMetrics']> {
    // Get historical performance data
    const historicalMetrics = this.contextManager.getRuntimePerformanceMetrics(
      context.userId,
      runtimeAssignment.constructId
    );

    // Calculate expected response time
    let expectedResponseTime = 3000; // Default 3 seconds
    if (historicalMetrics?.averageResponseTime) {
      expectedResponseTime = historicalMetrics.averageResponseTime;
    }

    // Apply performance requirements
    if (context.performanceRequirements?.maxResponseTime) {
      expectedResponseTime = Math.min(expectedResponseTime, context.performanceRequirements.maxResponseTime);
    }

    // Get fallback options
    const fallbackOptions = await this.getFallbackRuntimeOptions(runtimeAssignment, context);

    return {
      expectedResponseTime,
      confidenceScore: runtimeAssignment.confidence,
      fallbackOptions
    };
  }

  /**
   * Detect potential dependency conflicts
   */
  private async detectDependencyConflicts(
    runtimeAssignment: RuntimeAssignment,
    modelConfiguration: ResolvedDependencies['modelConfiguration'],
    contextConfiguration: ResolvedDependencies['contextConfiguration']
  ): Promise<DependencyConflict[]> {
    const conflicts: DependencyConflict[] = [];

    // Check for capability mismatches
    if (runtimeAssignment.gptId && this.gptManager) {
      const gptConfig = await this.gptManager.getGPT(runtimeAssignment.gptId);
      if (gptConfig && gptConfig.modelId !== modelConfiguration.modelId) {
        conflicts.push({
          type: 'capability_mismatch',
          description: `GPT configured for ${gptConfig.modelId} but resolver selected ${modelConfiguration.modelId}`,
          severity: 'medium',
          resolution: `Use GPT's configured model: ${gptConfig.modelId}`,
          alternativeOptions: []
        });
      }
    }

    // Check for performance conflicts
    if (contextConfiguration.memoryEnabled && contextConfiguration.workspaceContextEnabled) {
      conflicts.push({
        type: 'performance_conflict',
        description: 'Both memory and workspace context enabled may impact response time',
        severity: 'low',
        resolution: 'Monitor performance and disable features if needed'
      });
    }

    // Check for resource availability
    const isModelAvailable = await this.checkModelAvailability(modelConfiguration.modelId);
    if (!isModelAvailable) {
      conflicts.push({
        type: 'resource_unavailable',
        description: `Model ${modelConfiguration.modelId} is not available`,
        severity: 'critical',
        resolution: 'Fallback to available model'
      });
    }

    return conflicts;
  }

  /**
   * Resolve dependency conflicts automatically
   */
  private async resolveDependencyConflicts(
    conflicts: DependencyConflict[],
    context: DependencyResolutionContext
  ): Promise<ResolvedDependencies> {
    console.log(`[AutomaticDependencyResolver] Resolving ${conflicts.length} dependency conflicts for ${context.threadId}`);

    // Store conflicts for analysis
    this.conflictHistory.set(context.threadId, conflicts);

    // Apply automatic resolutions
    for (const conflict of conflicts) {
      if (conflict.severity === 'critical') {
        // Handle critical conflicts immediately
        await this.handleCriticalConflict(conflict, context);
      }
    }

    // Re-resolve dependencies after conflict resolution
    return this.resolveDependencies(context);
  }

  /**
   * Handle critical dependency conflicts
   */
  private async handleCriticalConflict(conflict: DependencyConflict, context: DependencyResolutionContext): Promise<void> {
    switch (conflict.type) {
      case 'resource_unavailable':
        // Switch to fallback runtime
        const fallbackAssignment = await this.getFallbackRuntimeAssignment(context);
        await this.contextManager.migrateRuntimeAssignment(
          context.threadId,
          fallbackAssignment,
          `Resource unavailable: ${conflict.description}`
        );
        break;

      case 'configuration_error':
        // Reset to safe defaults
        await this.resetToSafeDefaults(context);
        break;
    }
  }

  // Helper methods

  private generateCacheKey(context: DependencyResolutionContext): string {
    const keyParts = [
      context.threadId,
      context.userId,
      context.userMessage?.substring(0, 50) || '',
      context.requiredCapabilities?.join(',') || '',
      JSON.stringify(context.performanceRequirements || {})
    ];
    return keyParts.join('|');
  }

  private isCacheValid(cached: ResolvedDependencies, context: DependencyResolutionContext): boolean {
    // Cache is valid for 5 minutes
    const cacheAge = Date.now() - (cached as any).timestamp || 0;
    return cacheAge < 5 * 60 * 1000;
  }

  private async validateRuntimeAssignment(assignment: RuntimeAssignment, context: DependencyResolutionContext): boolean {
    // Check if assignment is still optimal for current context
    const optimalAssignment = await this.runtimeOrchestrator.determineOptimalRuntime({
      userMessage: context.userMessage,
      conversationHistory: context.conversationHistory,
      userId: context.userId,
      threadId: context.threadId,
      existingConstructId: assignment.constructId
    });

    // Consider still optimal if confidence difference is small
    return Math.abs(optimalAssignment.confidence - assignment.confidence) < 0.15;
  }

  private determineOptimalTemperature(context: DependencyResolutionContext, gptConfig: any): number {
    // Adjust temperature based on context and requirements
    let temperature = 0.7; // Default

    if (context.requiredCapabilities?.includes('creative')) {
      temperature = 0.9;
    } else if (context.requiredCapabilities?.includes('analytical')) {
      temperature = 0.3;
    } else if (context.requiredCapabilities?.includes('coding')) {
      temperature = 0.2;
    }

    return temperature;
  }

  private determineOptimalMaxTokens(context: DependencyResolutionContext, gptConfig: any): number {
    // Adjust max tokens based on context
    let maxTokens = 2000; // Default

    if (context.requiredCapabilities?.includes('creative')) {
      maxTokens = 4000; // Longer creative responses
    } else if (context.requiredCapabilities?.includes('coding')) {
      maxTokens = 3000; // Code can be lengthy
    }

    return maxTokens;
  }

  private selectModelForRuntime(assignment: RuntimeAssignment, context: DependencyResolutionContext): string {
    // Select appropriate model based on runtime type and requirements
    if (context.requiredCapabilities?.includes('coding')) {
      return 'gpt-4'; // Best for coding
    } else if (context.requiredCapabilities?.includes('creative')) {
      return 'gpt-4'; // Good for creative tasks
    } else {
      return 'gpt-3.5-turbo'; // Efficient for general tasks
    }
  }

  private determineTemperatureForContext(context: DependencyResolutionContext): number {
    return this.determineOptimalTemperature(context, null);
  }

  private determineMaxTokensForContext(context: DependencyResolutionContext): number {
    return this.determineOptimalMaxTokens(context, null);
  }

  private shouldEnableMemory(assignment: RuntimeAssignment, context: DependencyResolutionContext): boolean {
    // Enable memory for most runtimes except simple ones
    return assignment.constructId !== 'simple-assistant';
  }

  private shouldEnableWorkspaceContext(assignment: RuntimeAssignment, context: DependencyResolutionContext): boolean {
    // Enable workspace context for coding and technical runtimes
    return context.requiredCapabilities?.includes('coding') ||
      context.requiredCapabilities?.includes('technical') ||
      assignment.constructId.includes('dev') ||
      assignment.constructId.includes('code');
  }

  private shouldEnablePersonality(assignment: RuntimeAssignment, context: DependencyResolutionContext): boolean {
    // Enable personality for character-based runtimes
    return assignment.constructId !== 'lin' && assignment.constructId !== 'synth';
  }

  private async getFallbackRuntimeOptions(assignment: RuntimeAssignment, context: DependencyResolutionContext): Promise<RuntimeAssignment[]> {
    // Get alternative runtime options as fallbacks
    const recommendations = await this.contextManager.getRuntimeRecommendations(context.userId, 3);
    return recommendations.filter(rec => rec.constructId !== assignment.constructId);
  }

  private async checkModelAvailability(modelId: string): Promise<boolean> {
    // Check if model is available (simplified check)
    const availableModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro'];
    return availableModels.includes(modelId);
  }

  private async getFallbackRuntimeAssignment(context: DependencyResolutionContext): Promise<RuntimeAssignment> {
    // Get a safe fallback runtime assignment
    return {
      constructId: 'lin',
      runtimeId: `lin-${context.threadId}`,
      confidence: 0.6,
      reasoning: 'Fallback runtime due to dependency conflict'
    };
  }

  private async resetToSafeDefaults(context: DependencyResolutionContext): Promise<void> {
    // Reset to safe default configuration
    const safeAssignment = await this.getFallbackRuntimeAssignment(context);
    await this.contextManager.assignRuntimeToThread(
      context.threadId,
      safeAssignment,
      context.userId
    );
  }

  private async getFallbackDependencies(context: DependencyResolutionContext): Promise<ResolvedDependencies> {
    // Return safe fallback dependencies
    const fallbackAssignment = await this.getFallbackRuntimeAssignment(context);

    return {
      runtimeAssignment: fallbackAssignment,
      modelConfiguration: {
        modelId: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000
      },
      contextConfiguration: {
        memoryEnabled: false,
        workspaceContextEnabled: false,
        personalityEnabled: false
      },
      performanceMetrics: {
        expectedResponseTime: 5000,
        confidenceScore: 0.5,
        fallbackOptions: []
      }
    };
  }
}
