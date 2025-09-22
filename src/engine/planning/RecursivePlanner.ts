// src/engine/planning/RecursivePlanner.ts
// Goal decomposition and recursive planning without LLM dependencies

import { ParsedStructure } from '../parser/SymbolicParser';
import { ConversationDepth } from '../intent/IntentDepth';
import { Memory } from '../memory/PersonaBrain';

export interface Goal {
  id: string;
  description: string;
  type: 'conversation' | 'learning' | 'relationship' | 'problem_solving' | 'creative';
  priority: number;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'suspended';
  parent?: string; // Parent goal ID
  children: string[]; // Sub-goal IDs
  dependencies: string[]; // Goals that must complete first
  context: {
    intent?: string;
    emotion?: string;
    complexity?: number;
  };
  strategies: Strategy[];
  progress: number; // 0-1
  createdAt: number;
  updatedAt: number;
}

export interface Strategy {
  id: string;
  name: string;
  steps: Step[];
  successProbability: number;
  resourceCost: number; // Cognitive load
  previousOutcomes: Array<{ timestamp: number; success: boolean }>;
}

export interface Step {
  action: string;
  expectedOutcome: string;
  alternatives: string[];
  completed: boolean;
}

export interface PlanNode {
  goal: Goal;
  depth: number;
  path: string[]; // Goal IDs from root to this node
  estimatedCost: number;
  estimatedValue: number;
}

export class RecursivePlanner {
  private goals: Map<string, Goal> = new Map();
  private activeGoals: Set<string> = new Set();
  private completedGoals: Set<string> = new Set();
  private strategyLibrary: Map<string, Strategy> = new Map();
  private maxDepth: number = 5;
  private maxActiveGoals: number = 3;
  
  // Planning parameters
  private explorationRate: number = 0.2; // Explore vs exploit
  private learningRate: number = 0.1;
  
  constructor() {
    this.initializeStrategyLibrary();
  }
  
  private initializeStrategyLibrary(): void {
    // Pre-defined strategies for common goal types
    this.strategyLibrary.set('answer_question', {
      id: 'answer_question',
      name: 'Direct Question Response',
      steps: [
        {
          action: 'parse_question',
          expectedOutcome: 'understand_query',
          alternatives: ['request_clarification'],
          completed: false
        },
        {
          action: 'retrieve_relevant_knowledge',
          expectedOutcome: 'find_information',
          alternatives: ['acknowledge_uncertainty', 'decompose_question'],
          completed: false
        },
        {
          action: 'formulate_response',
          expectedOutcome: 'provide_answer',
          alternatives: ['provide_partial_answer', 'suggest_related_topics'],
          completed: false
        }
      ],
      successProbability: 0.8,
      resourceCost: 0.3,
      previousOutcomes: []
    });
    
    this.strategyLibrary.set('build_rapport', {
      id: 'build_rapport',
      name: 'Relationship Building',
      steps: [
        {
          action: 'show_interest',
          expectedOutcome: 'user_engagement',
          alternatives: ['mirror_emotion', 'share_observation'],
          completed: false
        },
        {
          action: 'find_common_ground',
          expectedOutcome: 'shared_understanding',
          alternatives: ['ask_preference', 'relate_experience'],
          completed: false
        },
        {
          action: 'maintain_connection',
          expectedOutcome: 'ongoing_engagement',
          alternatives: ['check_in', 'offer_support'],
          completed: false
        }
      ],
      successProbability: 0.7,
      resourceCost: 0.4,
      previousOutcomes: []
    });
    
    this.strategyLibrary.set('solve_problem', {
      id: 'solve_problem',
      name: 'Problem Solving',
      steps: [
        {
          action: 'identify_problem',
          expectedOutcome: 'clear_problem_statement',
          alternatives: ['request_details', 'identify_constraints'],
          completed: false
        },
        {
          action: 'decompose_problem',
          expectedOutcome: 'sub_problems',
          alternatives: ['simplify_problem', 'find_similar_problems'],
          completed: false
        },
        {
          action: 'generate_solutions',
          expectedOutcome: 'solution_options',
          alternatives: ['brainstorm_approaches', 'apply_known_patterns'],
          completed: false
        },
        {
          action: 'evaluate_solutions',
          expectedOutcome: 'best_solution',
          alternatives: ['compare_tradeoffs', 'test_hypothesis'],
          completed: false
        }
      ],
      successProbability: 0.6,
      resourceCost: 0.7,
      previousOutcomes: []
    });
    
    this.strategyLibrary.set('creative_exploration', {
      id: 'creative_exploration',
      name: 'Creative Thinking',
      steps: [
        {
          action: 'divergent_thinking',
          expectedOutcome: 'multiple_ideas',
          alternatives: ['free_association', 'random_stimulation'],
          completed: false
        },
        {
          action: 'connect_concepts',
          expectedOutcome: 'novel_combinations',
          alternatives: ['metaphorical_thinking', 'cross_domain_transfer'],
          completed: false
        },
        {
          action: 'refine_ideas',
          expectedOutcome: 'polished_concept',
          alternatives: ['iterate_variations', 'combine_best_elements'],
          completed: false
        }
      ],
      successProbability: 0.5,
      resourceCost: 0.6,
      previousOutcomes: []
    });
  }
  
  // Goal creation and decomposition
  createGoal(
    description: string,
    type: Goal['type'],
    context: { parsed?: ParsedStructure; depth?: ConversationDepth },
    parentId?: string
  ): Goal {
    const goal: Goal = {
      id: this.generateGoalId(),
      description,
      type,
      priority: this.calculatePriority(type, context),
      status: 'pending',
      parent: parentId,
      children: [],
      dependencies: [],
      context: {
        intent: context.depth?.primaryIntent,
        emotion: context.depth?.emotionalUndertone,
        complexity: context.parsed?.complexity
      },
      strategies: this.selectStrategies(type, context),
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.goals.set(goal.id, goal);
    
    // Add to parent's children if applicable
    if (parentId) {
      const parent = this.goals.get(parentId);
      if (parent) {
        parent.children.push(goal.id);
      }
    }
    
    // Decompose if complex
    if (goal.context.complexity && goal.context.complexity > 0.7) {
      this.decomposeGoal(goal);
    }
    
    return goal;
  }
  
  private calculatePriority(type: Goal['type'], context: any): number {
    let priority = 0.5;
    
    // Type-based priority
    const typePriorities = {
      'problem_solving': 0.8,
      'conversation': 0.7,
      'learning': 0.6,
      'relationship': 0.5,
      'creative': 0.4
    };
    
    priority = typePriorities[type] || 0.5;
    
    // Context adjustments
    if (context.depth?.emotionalUndertone === 'negative') {
      priority += 0.2; // Prioritize negative emotions
    }
    
    if (context.depth?.cognitiveLoad > 0.7) {
      priority += 0.1; // Complex requests get priority
    }
    
    return Math.min(1, priority);
  }
  
  private selectStrategies(type: Goal['type'], context: any): Strategy[] {
    const strategies: Strategy[] = [];
    
    // Map goal types to strategies
    const strategyMap: Record<Goal['type'], string[]> = {
      'conversation': ['answer_question', 'build_rapport'],
      'learning': ['answer_question', 'solve_problem'],
      'relationship': ['build_rapport'],
      'problem_solving': ['solve_problem', 'answer_question'],
      'creative': ['creative_exploration', 'solve_problem']
    };
    
    const strategyIds = strategyMap[type] || ['answer_question'];
    
    for (const id of strategyIds) {
      const strategy = this.strategyLibrary.get(id);
      if (strategy) {
        // Clone strategy so we can modify it per goal
        strategies.push({
          ...strategy,
          steps: strategy.steps.map(step => ({ ...step }))
        });
      }
    }
    
    return strategies;
  }
  
  private decomposeGoal(goal: Goal): void {
    // Decompose based on goal type
    const decompositions: Record<Goal['type'], string[]> = {
      'conversation': ['understand_intent', 'gather_context', 'respond_appropriately'],
      'learning': ['identify_knowledge_gap', 'find_patterns', 'integrate_knowledge'],
      'relationship': ['assess_current_state', 'identify_needs', 'strengthen_bond'],
      'problem_solving': ['define_problem', 'explore_solutions', 'implement_solution'],
      'creative': ['generate_ideas', 'combine_concepts', 'refine_output']
    };
    
    const subGoalDescriptions = decompositions[goal.type] || [];
    
    for (const description of subGoalDescriptions) {
      const subGoal = this.createGoal(
        `${goal.description} - ${description}`,
        goal.type,
        { parsed: undefined, depth: undefined },
        goal.id
      );
      
      // Set dependencies (each depends on previous)
      if (goal.children.length > 1) {
        const previousChild = goal.children[goal.children.length - 2];
        subGoal.dependencies.push(previousChild);
      }
    }
  }
  
  // Planning and execution
  plan(currentContext: { parsed: ParsedStructure; depth: ConversationDepth }): PlanNode[] {
    // Clean up completed goals
    this.cleanupCompletedGoals();
    
    // Create new goals based on context
    this.createGoalsFromContext(currentContext);
    
    // Build planning tree
    const planTree = this.buildPlanTree();
    
    // Select best path
    const bestPath = this.selectBestPath(planTree);
    
    // Activate goals on best path
    this.activateGoals(bestPath);
    
    return bestPath;
  }
  
  private createGoalsFromContext(context: { parsed: ParsedStructure; depth: ConversationDepth }): void {
    // Determine primary goal type
    let goalType: Goal['type'] = 'conversation';
    
    if (context.depth.layers.some(l => l.intent.includes('problem'))) {
      goalType = 'problem_solving';
    } else if (context.depth.layers.some(l => l.type === 'relational')) {
      goalType = 'relationship';
    } else if (context.depth.layers.some(l => l.intent.includes('learn'))) {
      goalType = 'learning';
    } else if (context.depth.layers.some(l => l.intent.includes('create'))) {
      goalType = 'creative';
    }
    
    // Check if we need a new goal
    const activeGoalsOfType = Array.from(this.activeGoals)
      .map(id => this.goals.get(id))
      .filter(g => g && g.type === goalType);
    
    if (activeGoalsOfType.length === 0) {
      this.createGoal(
        `Handle ${context.depth.primaryIntent}`,
        goalType,
        context
      );
    }
  }
  
  private buildPlanTree(): PlanNode[] {
    const nodes: PlanNode[] = [];
    const pending = Array.from(this.goals.values())
      .filter(g => g.status === 'pending' || g.status === 'active');
    
    for (const goal of pending) {
      this.buildPlanNode(goal, nodes, [], 0);
    }
    
    return nodes;
  }
  
  private buildPlanNode(
    goal: Goal,
    nodes: PlanNode[],
    path: string[],
    depth: number
  ): void {
    if (depth > this.maxDepth || path.includes(goal.id)) {
      return; // Prevent infinite recursion
    }
    
    const node: PlanNode = {
      goal,
      depth,
      path: [...path, goal.id],
      estimatedCost: this.estimateGoalCost(goal),
      estimatedValue: this.estimateGoalValue(goal)
    };
    
    nodes.push(node);
    
    // Recursively add children
    for (const childId of goal.children) {
      const child = this.goals.get(childId);
      if (child && child.status !== 'completed') {
        this.buildPlanNode(child, nodes, node.path, depth + 1);
      }
    }
  }
  
  private estimateGoalCost(goal: Goal): number {
    let cost = 0;
    
    // Base cost from strategies
    for (const strategy of goal.strategies) {
      cost += strategy.resourceCost;
    }
    
    // Add cost for incomplete dependencies
    for (const depId of goal.dependencies) {
      const dep = this.goals.get(depId);
      if (dep && dep.status !== 'completed') {
        cost += this.estimateGoalCost(dep) * 0.5;
      }
    }
    
    return cost;
  }
  
  private estimateGoalValue(goal: Goal): number {
    let value = goal.priority;
    
    // Adjust based on context
    if (goal.context.emotion === 'negative') {
      value *= 1.2; // Higher value for addressing negative emotions
    }
    
    // Consider success probability
    const avgSuccess = goal.strategies.reduce((sum, s) => sum + s.successProbability, 0) / goal.strategies.length;
    value *= avgSuccess;
    
    // Decay value over time
    const age = Date.now() - goal.createdAt;
    const decay = Math.exp(-age / (1000 * 60 * 10)); // 10 minute half-life
    value *= decay;
    
    return value;
  }
  
  private selectBestPath(nodes: PlanNode[]): PlanNode[] {
    if (nodes.length === 0) return [];
    
    // Group nodes by root goal
    const pathsByRoot = new Map<string, PlanNode[]>();
    
    for (const node of nodes) {
      const rootId = node.path[0];
      if (!pathsByRoot.has(rootId)) {
        pathsByRoot.set(rootId, []);
      }
      pathsByRoot.get(rootId)!.push(node);
    }
    
    // Score each path
    const pathScores: Array<{ path: PlanNode[]; score: number }> = [];
    
    for (const [rootId, pathNodes] of pathsByRoot) {
      const path = pathNodes.filter(n => n.goal.id === rootId || n.path.includes(rootId));
      const score = this.scorePath(path);
      pathScores.push({ path, score });
    }
    
    // Select best path with exploration
    if (Math.random() < this.explorationRate) {
      // Explore: pick random path
      const randomIndex = Math.floor(Math.random() * pathScores.length);
      return pathScores[randomIndex]?.path || [];
    } else {
      // Exploit: pick best path
      pathScores.sort((a, b) => b.score - a.score);
      return pathScores[0]?.path || [];
    }
  }
  
  private scorePath(path: PlanNode[]): number {
    if (path.length === 0) return 0;
    
    let totalValue = 0;
    let totalCost = 0;
    
    for (const node of path) {
      totalValue += node.estimatedValue * Math.pow(0.9, node.depth); // Discount future value
      totalCost += node.estimatedCost;
    }
    
    // Penalize if too many active goals
    const penalty = this.activeGoals.size > this.maxActiveGoals ? 0.5 : 1;
    
    return (totalValue / (totalCost + 1)) * penalty;
  }
  
  private activateGoals(path: PlanNode[]): void {
    for (const node of path) {
      if (node.goal.status === 'pending' && this.canActivateGoal(node.goal)) {
        node.goal.status = 'active';
        node.goal.updatedAt = Date.now();
        this.activeGoals.add(node.goal.id);
      }
    }
  }
  
  private canActivateGoal(goal: Goal): boolean {
    // Check dependencies
    for (const depId of goal.dependencies) {
      const dep = this.goals.get(depId);
      if (dep && dep.status !== 'completed') {
        return false;
      }
    }
    
    // Check resource constraints
    return this.activeGoals.size < this.maxActiveGoals;
  }
  
  // Execution and learning
  executeStep(goalId: string): { action: string; success: boolean; alternative?: string } {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status !== 'active') {
      return { action: 'no_action', success: false };
    }
    
    // Find current strategy
    const strategy = goal.strategies.find(s => 
      s.steps.some(step => !step.completed)
    );
    
    if (!strategy) {
      this.completeGoal(goalId, true);
      return { action: 'goal_completed', success: true };
    }
    
    // Find next step
    const step = strategy.steps.find(s => !s.completed);
    if (!step) {
      return { action: 'no_step', success: false };
    }
    
    // Execute step (simulate success based on probability)
    const success = Math.random() < strategy.successProbability;
    
    if (success) {
      step.completed = true;
      goal.progress = this.calculateProgress(goal);
      goal.updatedAt = Date.now();
      
      // Learn from success
      this.updateStrategySuccess(strategy, true);
      
      return { action: step.action, success: true };
    } else {
      // Try alternative
      if (step.alternatives.length > 0) {
        const alternative = step.alternatives[Math.floor(Math.random() * step.alternatives.length)];
        
        // 50% chance alternative works
        if (Math.random() < 0.5) {
          step.completed = true;
          goal.progress = this.calculateProgress(goal);
          goal.updatedAt = Date.now();
          
          return { action: step.action, success: true, alternative };
        }
      }
      
      // Learn from failure
      this.updateStrategySuccess(strategy, false);
      
      return { action: step.action, success: false };
    }
  }
  
  private calculateProgress(goal: Goal): number {
    let totalSteps = 0;
    let completedSteps = 0;
    
    for (const strategy of goal.strategies) {
      totalSteps += strategy.steps.length;
      completedSteps += strategy.steps.filter(s => s.completed).length;
    }
    
    const stepProgress = totalSteps > 0 ? completedSteps / totalSteps : 0;
    
    // Consider children progress
    if (goal.children.length > 0) {
      const childProgress = goal.children.reduce((sum, childId) => {
        const child = this.goals.get(childId);
        return sum + (child?.progress || 0);
      }, 0) / goal.children.length;
      
      return (stepProgress + childProgress) / 2;
    }
    
    return stepProgress;
  }
  
  private updateStrategySuccess(strategy: Strategy, success: boolean): void {
    // Record outcome
    strategy.previousOutcomes.push({
      timestamp: Date.now(),
      success
    });
    
    // Keep only recent outcomes
    if (strategy.previousOutcomes.length > 10) {
      strategy.previousOutcomes.shift();
    }
    
    // Update success probability
    const recentSuccess = strategy.previousOutcomes
      .filter(o => o.success).length / strategy.previousOutcomes.length;
    
    strategy.successProbability = 
      strategy.successProbability * (1 - this.learningRate) + 
      recentSuccess * this.learningRate;
  }
  
  private completeGoal(goalId: string, success: boolean): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;
    
    goal.status = success ? 'completed' : 'failed';
    goal.updatedAt = Date.now();
    this.activeGoals.delete(goalId);
    this.completedGoals.add(goalId);
    
    // Complete parent if all children done
    if (goal.parent) {
      const parent = this.goals.get(goal.parent);
      if (parent) {
        const allChildrenComplete = parent.children.every(childId => {
          const child = this.goals.get(childId);
          return child && (child.status === 'completed' || child.status === 'failed');
        });
        
        if (allChildrenComplete) {
          const anyChildSuccess = parent.children.some(childId => {
            const child = this.goals.get(childId);
            return child && child.status === 'completed';
          });
          
          this.completeGoal(goal.parent, anyChildSuccess);
        }
      }
    }
  }
  
  private cleanupCompletedGoals(): void {
    // Remove old completed goals
    const cutoff = Date.now() - (1000 * 60 * 60); // 1 hour
    
    for (const goalId of this.completedGoals) {
      const goal = this.goals.get(goalId);
      if (goal && goal.updatedAt < cutoff) {
        this.goals.delete(goalId);
        this.completedGoals.delete(goalId);
      }
    }
  }
  
  // Public interface
  getCurrentPlan(): { goals: Goal[]; strategies: Strategy[] } {
    const activeGoalsList = Array.from(this.activeGoals)
      .map(id => this.goals.get(id))
      .filter(g => g) as Goal[];
    
    const strategies = activeGoalsList.flatMap(g => g.strategies);
    
    return { goals: activeGoalsList, strategies };
  }
  
  getGoalStatus(goalId: string): Goal | null {
    return this.goals.get(goalId) || null;
  }
  
  suspendGoal(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (goal && goal.status === 'active') {
      goal.status = 'suspended';
      goal.updatedAt = Date.now();
      this.activeGoals.delete(goalId);
    }
  }
  
  resumeGoal(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (goal && goal.status === 'suspended' && this.canActivateGoal(goal)) {
      goal.status = 'active';
      goal.updatedAt = Date.now();
      this.activeGoals.add(goalId);
    }
  }
  
  private generateGoalId(): string {
    return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}