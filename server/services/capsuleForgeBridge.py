#!/usr/bin/env python3
"""
CapsuleForge Bridge - Wrapper for calling CapsuleForge from Node.js

Usage: python3 capsuleForgeBridge.py generate <json_data>
"""

import sys
import json
import os
from pathlib import Path

# Add VVAULT to path
# Path from chatty/server/services/capsuleForgeBridge.py to vvault/
# Go up: services -> server -> chatty -> GitHub -> vvault
script_dir = Path(__file__).resolve().parent
vvault_root = script_dir.parent.parent.parent / 'vvault'
if not vvault_root.exists():
    # Try alternative path (if vvault is sibling to chatty)
    vvault_root = script_dir.parent.parent.parent.parent / 'vvault'
sys.path.insert(0, str(vvault_root))

try:
    from capsuleforge import CapsuleForge
except ImportError:
    # Try alternative import path
    import importlib.util
    capsuleforge_path = vvault_root / 'capsuleforge.py'
    if capsuleforge_path.exists():
        spec = importlib.util.spec_from_file_location("capsuleforge", capsuleforge_path)
        capsuleforge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(capsuleforge)
        CapsuleForge = capsuleforge.CapsuleForge
    else:
        print(json.dumps({"error": f"CapsuleForge not found at {capsuleforge_path}"}), file=sys.stderr)
        sys.exit(1)

def generate_capsule(data_json):
    """Generate a capsule from JSON data"""
    try:
        data = json.loads(data_json)
        
        instance_name = data.get('instance_name', 'unknown-001')
        traits = data.get('traits', {})
        memory_log = data.get('memory_log', [])
        personality_type = data.get('personality_type', 'UNKNOWN')
        additional_data = data.get('additional_data', {})
        vault_path = data.get('vault_path', None)
        instance_path = data.get('instance_path', None)  # New: instance directory path
        
        # Initialize CapsuleForge with instance path (saves directly in instance directory)
        forge = CapsuleForge(vault_path=vault_path, instance_path=instance_path)
        
        # Generate capsule
        capsule_path = forge.generate_capsule(
            instance_name=instance_name,
            traits=traits,
            memory_log=memory_log,
            personality_type=personality_type,
            additional_data=additional_data if additional_data else None
        )
        
        # Return result as JSON
        result = {
            "success": True,
            "capsulePath": capsule_path,
            "instanceName": instance_name
        }
        print(json.dumps(result))
        return 0
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result), file=sys.stderr)
        return 1

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python3 capsuleForgeBridge.py generate <json_data>"}), file=sys.stderr)
        sys.exit(1)
    
    command = sys.argv[1]
    data_json = sys.argv[2]
    
    if command == "generate":
        exit_code = generate_capsule(data_json)
        sys.exit(exit_code)
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}), file=sys.stderr)
        sys.exit(1)

