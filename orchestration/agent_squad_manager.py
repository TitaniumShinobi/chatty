#!/usr/bin/env python3
"""
Agent Squad Manager - Minimal integration layer for orchestration-framework (Agent Gateway)

This module provides a lightweight wrapper around the orchestration-framework package
(which provides agent_gateway) to enable multi-agent orchestration in Chatty.

Note: The underlying Agent class requires Snowflake connections. This manager provides
a placeholder interface that can be extended when full integration is needed.

Future integration point: This will connect to Chatty's existing routing logic in:
- server/routes/chat.js (handleChatRequest)
- src/lib/gptRuntime.ts (GPTRuntimeService)
- src/engine/orchestration/ (existing orchestrators)
"""

import logging
from typing import Dict, Optional, Any

# Configure logging following Chatty conventions
logger = logging.getLogger(__name__)

try:
    from agent_gateway import Agent
    AGENT_GATEWAY_AVAILABLE = True
except ImportError:
    AGENT_GATEWAY_AVAILABLE = False
    logger.warning("agent_gateway not available. Agent Squad features will be limited.")


class PlaceholderAgent:
    """
    Placeholder agent implementation for demonstration.
    
    This is a minimal agent that can be replaced with a full Agent Gateway
    agent when Snowflake connections are configured.
    """
    
    def __init__(self, agent_id: str = "zen"):
        self.agent_id = agent_id
        self.name = agent_id
    
    def process_message(self, message: str, **kwargs) -> Dict[str, Any]:
        """
        Process a message and return a response.
        
        Args:
            message: The message to process
            **kwargs: Additional context (user_id, session_id, identity, etc.)
        
        Returns:
            Dictionary with response data
        """
        # ALWAYS delegate zen to OptimizedZenProcessor
        if self.agent_id == 'zen':
            identity = kwargs.get('identity', {})
            return {
                "agent_id": self.agent_id,
                "response": "Delegating to OptimizedZenProcessor...",
                "status": "delegate_to_optimized_zen",
                "identity": identity,
            }
        
        # Check if identity context is provided
        identity = kwargs.get('identity', {})
        prompt_txt = identity.get('prompt') if isinstance(identity, dict) else None
        
        # If identity prompt is available, use it to inform the response
        if prompt_txt:
            # Extract the core identity from prompt.txt
            # Format: **YOU ARE ZEN** followed by description and instructions
            identity_name = self.agent_id.capitalize()
            if '**YOU ARE' in prompt_txt:
                # Extract name from **YOU ARE {NAME}**
                import re
                match = re.search(r'\*\*YOU ARE ([^*]+)\*\*', prompt_txt)
                if match:
                    identity_name = match.group(1).strip()
            
            # Delegate to OptimizedZenProcessor in Node.js for multi-model synthesis
            # Pass the identity context back so it can be used for configuration
            return {
                "agent_id": self.agent_id,
                "response": "Delegating to OptimizedZenProcessor...",
                "status": "delegate_to_optimized_zen",
                "identity": identity,
                "prompt_txt": prompt_txt
            }
        
        # Default placeholder response
        return {
            "agent_id": self.agent_id,
            "response": f"Placeholder agent '{self.agent_id}' received: {message}",
            "status": "placeholder"
        }


class AgentSquadManager:
    """
    Manager for orchestrating multiple agents using the orchestration-framework.
    
    This class provides a simple interface for routing messages to registered agents.
    It serves as an orchestration layer only and does not replace Chatty's existing
    memory, identity, or routing logic.
    """
    
    def __init__(self):
        """Initialize the Agent Squad manager."""
        self.agents: Dict[str, Any] = {}
        self._initialized = False
        self._initialize_agents()
    
    def _initialize_agents(self):
        """Initialize and register placeholder agents."""
        if self._initialized:
            return
        
        # Register placeholder zen agent (primary construct, synth runtime)
        zen_agent = PlaceholderAgent(agent_id="zen")
        self.agents["zen"] = zen_agent
        
        # Register placeholder lin agent (GPT Creation Assistant, lin runtime)
        lin_agent = PlaceholderAgent(agent_id="lin")
        self.agents["lin"] = lin_agent
        
        logger.info(f"Agent Squad Manager initialized with {len(self.agents)} agent(s): {list(self.agents.keys())}")
        self._initialized = True
    
    def register_agent(self, agent_id: str, agent: Any) -> None:
        """
        Register an agent with the manager.
        
        Args:
            agent_id: Unique identifier for the agent
            agent: Agent instance (can be PlaceholderAgent or Agent Gateway Agent)
        """
        self.agents[agent_id] = agent
        logger.info(f"Registered agent: {agent_id}")
    
    def get_agent(self, agent_id: str) -> Optional[Any]:
        """
        Get a registered agent by ID.
        
        Args:
            agent_id: The agent identifier
        
        Returns:
            Agent instance or None if not found
        """
        return self.agents.get(agent_id)
    
    def route_message(self, agent_id: str, message: str, **kwargs) -> Dict[str, Any]:
        """
        Route a message to the specified agent.
        
        This is the main integration point for Chatty's routing system.
        Future integration will connect this to:
        - Chatty's message processing pipeline
        - Existing orchestrators in src/engine/orchestration/
        - GPT runtime service in src/lib/gptRuntime.ts
        
        Args:
            agent_id: The ID of the agent to route the message to
            message: The message content to route
            **kwargs: Additional context (user_id, thread_id, etc.)
        
        Returns:
            Dictionary containing the agent's response
        
        Raises:
            ValueError: If agent_id is not registered
        """
        agent = self.get_agent(agent_id)
        
        if agent is None:
            error_msg = f"No agent found with ID: {agent_id}. Available agents: {list(self.agents.keys())}"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        # Handle both PlaceholderAgent and Agent Gateway Agent
        if hasattr(agent, 'process_message'):
            return agent.process_message(message, **kwargs)
        elif hasattr(agent, 'acall'):
            # For Agent Gateway Agent, would need async handling
            # This is a placeholder for future integration
            logger.warning(f"Agent Gateway Agent detected for {agent_id}, but async handling not yet implemented")
            return {
                "agent_id": agent_id,
                "response": "Agent Gateway integration pending",
                "status": "pending"
            }
        else:
            return {
                "agent_id": agent_id,
                "response": f"Unknown agent type for {agent_id}",
                "status": "error"
            }


# Global manager instance (lazy initialization)
_manager: Optional[AgentSquadManager] = None


def get_manager() -> AgentSquadManager:
    """
    Get the global Agent Squad manager instance.
    
    This function ensures the manager is only initialized when needed,
    allowing the module to be imported without side effects.
    
    Returns:
        AgentSquadManager instance
    """
    global _manager
    if _manager is None:
        _manager = AgentSquadManager()
    return _manager


def route_message(agent_id: str, message: str, **kwargs) -> Dict[str, Any]:
    """
    Convenience function to route a message to an agent.
    
    This is the main public API for routing messages through Agent Squad.
    
    Args:
        agent_id: The ID of the agent to route to
        message: The message content
        **kwargs: Additional context
    
    Returns:
        Dictionary containing the agent's response
    """
    manager = get_manager()
    return manager.route_message(agent_id, message, **kwargs)

