#!/usr/bin/env python3
"""
CLI entry point for Agent Squad orchestration framework.

Usage:
    python3 -m orchestration.cli <agent_id> <message> [context_json]
    
Example:
    echo '{"user_id": "test"}' | python3 -m orchestration.cli zen "Hello"
"""

import sys
import json
import os
from pathlib import Path

# Add chatty root to path so we can import orchestration module
script_dir = Path(__file__).resolve().parent
chatty_root = script_dir.parent
sys.path.insert(0, str(chatty_root))

try:
    from orchestration.agent_squad_manager import route_message
except ImportError as e:
    print(json.dumps({
        "error": f"Failed to import orchestration module: {str(e)}",
        "status": "error"
    }), file=sys.stderr)
    sys.exit(1)


def main():
    """Main CLI entry point."""
    import json as json_module
    import time
    
    # #region agent log
    log_entry = {
        "location": "orchestration/cli.py:main",
        "message": "cli: entry",
        "data": {"argCount": len(sys.argv), "argv": sys.argv[1:3] if len(sys.argv) >= 3 else sys.argv[1:]},
        "timestamp": int(time.time() * 1000),
        "sessionId": "orchestration-test",
        "runId": "test-run-1",
        "hypothesisId": "Y"
    }
    try:
        with open('/Users/devonwoodson/Documents/GitHub/.cursor/debug.log', 'a') as f:
            f.write(json_module.dumps(log_entry) + '\n')
    except:
        pass
    # #endregion
    
    if len(sys.argv) < 3:
        error_response = {
            "error": "Usage: python3 -m orchestration.cli <agent_id> <message> [context_json]",
            "status": "error"
        }
        print(json.dumps(error_response), file=sys.stderr)
        sys.exit(1)
    
    agent_id = sys.argv[1]
    message = sys.argv[2]
    
    # #region agent log
    log_entry = {
        "location": "orchestration/cli.py:main",
        "message": "cli: received params",
        "data": {"agent_id": agent_id, "messageLength": len(message)},
        "timestamp": int(time.time() * 1000),
        "sessionId": "orchestration-test",
        "runId": "test-run-1",
        "hypothesisId": "Z"
    }
    try:
        with open('/Users/devonwoodson/Documents/GitHub/.cursor/debug.log', 'a') as f:
            f.write(json_module.dumps(log_entry) + '\n')
    except:
        pass
    # #endregion
    
    # Read context from stdin if available, otherwise empty dict
    context = {}
    if not sys.stdin.isatty():
        try:
            stdin_content = sys.stdin.read()
            if stdin_content.strip():
                context = json.loads(stdin_content)
        except json.JSONDecodeError as e:
            error_response = {
                "error": f"Invalid JSON in stdin: {str(e)}",
                "status": "error"
            }
            print(json.dumps(error_response), file=sys.stderr)
            sys.exit(1)
    
    try:
        # #region agent log
        log_entry = {
            "location": "orchestration/cli.py:main",
            "message": "cli: calling route_message",
            "data": {"agent_id": agent_id, "contextKeys": list(context.keys())},
            "timestamp": int(time.time() * 1000),
            "sessionId": "orchestration-test",
            "runId": "test-run-1",
            "hypothesisId": "AA"
        }
        try:
            with open('/Users/devonwoodson/Documents/GitHub/.cursor/debug.log', 'a') as f:
                f.write(json_module.dumps(log_entry) + '\n')
        except:
            pass
        # #endregion
        
        # Route the message through orchestration
        result = route_message(agent_id, message, **context)
        
        # #region agent log
        log_entry = {
            "location": "orchestration/cli.py:main",
            "message": "cli: route_message result",
            "data": {"agent_id": agent_id, "status": result.get("status"), "responseLength": len(result.get("response", ""))},
            "timestamp": int(time.time() * 1000),
            "sessionId": "orchestration-test",
            "runId": "test-run-1",
            "hypothesisId": "AB"
        }
        try:
            with open('/Users/devonwoodson/Documents/GitHub/.cursor/debug.log', 'a') as f:
                f.write(json_module.dumps(log_entry) + '\n')
        except:
            pass
        # #endregion
        
        # Output result as JSON
        print(json.dumps(result))
        sys.exit(0)
        
    except ValueError as e:
        # Agent not found or other validation error
        error_response = {
            "error": str(e),
            "status": "error",
            "agent_id": agent_id
        }
        print(json.dumps(error_response), file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        # Unexpected error
        error_response = {
            "error": f"Unexpected error: {str(e)}",
            "status": "error",
            "agent_id": agent_id
        }
        print(json.dumps(error_response), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

