"""
Orchestration module for Chatty.

This module provides integration with multi-agent orchestration frameworks.
"""

from .agent_squad_manager import (
    AgentSquadManager,
    PlaceholderAgent,
    route_message,
    get_manager,
)

__all__ = [
    "AgentSquadManager",
    "PlaceholderAgent",
    "route_message",
    "get_manager",
]

