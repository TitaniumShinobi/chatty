#!/usr/bin/env python3
"""
Chatty Authentication Module - PBKDF2 + Passlib Implementation
Provides secure password hashing and verification using Passlib's CryptContext.

Features:
- PBKDF2-SHA256 with 200k rounds for security
- Easy upgrade path to Argon2 via Passlib's scheme fallback
- Password strength validation
- Hash upgrade detection and migration
- Comprehensive logging

@author Devon Woodson
@version 1.0.0
"""

import sys
import json
import re
from typing import Dict, Any, Optional, Tuple
from passlib.context import CryptContext
from passlib.hash import pbkdf2_sha256, argon2

# Configure Passlib CryptContext with PBKDF2 as primary and Argon2 as fallback
# This allows easy migration to Argon2 in the future
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "argon2"],
    default="pbkdf2_sha256",
    pbkdf2_sha256__rounds=200000,  # 200k rounds for security
    argon2__rounds=3,  # Argon2 rounds (will be used for future upgrades)
    deprecated=["auto"]  # Automatically detect deprecated schemes
)

class ChattyAuth:
    """Chatty Authentication Handler using PBKDF2 + Passlib"""
    
    def __init__(self):
        self.context = pwd_context
    
    def validate_password_strength(self, password: str) -> Dict[str, Any]:
        """
        Validate password strength requirements.
        
        Args:
            password: Password to validate
            
        Returns:
            Dict with 'is_valid' boolean and 'errors' list
        """
        min_length = 8
        has_upper = bool(re.search(r'[A-Z]', password))
        has_lower = bool(re.search(r'[a-z]', password))
        has_digit = bool(re.search(r'\d', password))
        has_special = bool(re.search(r'[!@#$%^&*(),.?":{}|<>]', password))
        
        errors = []
        
        if len(password) < min_length:
            errors.append(f"Password must be at least {min_length} characters long")
        if not has_upper:
            errors.append("Password must contain at least one uppercase letter")
        if not has_lower:
            errors.append("Password must contain at least one lowercase letter")
        if not has_digit:
            errors.append("Password must contain at least one number")
        if not has_special:
            errors.append("Password must contain at least one special character")
        
        return {
            "is_valid": len(errors) == 0,
            "errors": errors
        }
    
    def validate_email(self, email: str) -> bool:
        """
        Validate email format.
        
        Args:
            email: Email to validate
            
        Returns:
            Boolean indicating if email is valid
        """
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        return bool(re.match(email_regex, email))
    
    def hash_password(self, password: str) -> str:
        """
        Hash password using PBKDF2-SHA256 with 200k rounds.
        
        Args:
            password: Plain text password
            
        Returns:
            Hashed password string
        """
        try:
            hashed = self.context.hash(password)
            print(f"🔐 Password hashed using PBKDF2 for user: ...", file=sys.stderr)
            return hashed
        except Exception as e:
            print(f"❌ Password hashing failed: {e}", file=sys.stderr)
            raise
    
    def verify_password(self, password: str, hashed: str) -> Tuple[bool, bool]:
        """
        Verify password against hash and check if hash needs update.
        
        Args:
            password: Plain text password
            hashed: Stored hash
            
        Returns:
            Tuple of (is_valid, needs_update)
        """
        try:
            # Verify password
            is_valid = self.context.verify(password, hashed)
            
            # Check if hash needs update (e.g., from old scheme or fewer rounds)
            needs_update = self.context.needs_update(hashed)
            
            if is_valid and needs_update:
                print(f"⚠️ Password hash needs update for user: ...", file=sys.stderr)
            
            return is_valid, needs_update
            
        except Exception as e:
            print(f"❌ Password verification failed: {e}", file=sys.stderr)
            return False, False
    
    def upgrade_password_hash(self, password: str, old_hash: str) -> str:
        """
        Upgrade password hash to current scheme/rounds.
        
        Args:
            password: Plain text password
            old_hash: Old hash to upgrade
            
        Returns:
            New upgraded hash
        """
        try:
            # Verify old password first
            if not self.context.verify(password, old_hash):
                raise ValueError("Invalid password for hash upgrade")
            
            # Generate new hash with current settings
            new_hash = self.context.hash(password)
            print(f"🔄 Password hash upgraded for user: ...", file=sys.stderr)
            return new_hash
            
        except Exception as e:
            print(f"❌ Password hash upgrade failed: {e}", file=sys.stderr)
            raise
    
    def get_hash_info(self, hashed: str) -> Dict[str, Any]:
        """
        Get information about a password hash.
        
        Args:
            hashed: Password hash to analyze
            
        Returns:
            Dict with hash information
        """
        try:
            info = {
                "scheme": self.context.identify(hashed),
                "needs_update": self.context.needs_update(hashed),
                "is_valid_format": True
            }
            return info
        except Exception as e:
            return {
                "scheme": "unknown",
                "needs_update": True,
                "is_valid_format": False,
                "error": str(e)
            }

def main():
    """Main function for CLI usage"""
    if len(sys.argv) < 2:
        print("Usage: python auth.py <command> [args...]")
        print("Commands:")
        print("  hash <password>           - Hash a password")
        print("  verify <password> <hash>  - Verify a password")
        print("  validate <password>       - Validate password strength")
        print("  email <email>             - Validate email format")
        print("  info <hash>               - Get hash information")
        sys.exit(1)
    
    auth = ChattyAuth()
    command = sys.argv[1]
    
    try:
        if command == "hash":
            if len(sys.argv) != 3:
                print("Usage: python auth.py hash <password>")
                sys.exit(1)
            password = sys.argv[2]
            hashed = auth.hash_password(password)
            print(json.dumps({"hashed": hashed}))
            
        elif command == "verify":
            if len(sys.argv) != 4:
                print("Usage: python auth.py verify <password> <hash>")
                sys.exit(1)
            password = sys.argv[2]
            hashed = sys.argv[3]
            is_valid, needs_update = auth.verify_password(password, hashed)
            print(json.dumps({
                "is_valid": is_valid,
                "needs_update": needs_update
            }))
            
        elif command == "validate":
            if len(sys.argv) != 3:
                print("Usage: python auth.py validate <password>")
                sys.exit(1)
            password = sys.argv[2]
            result = auth.validate_password_strength(password)
            print(json.dumps(result))
            
        elif command == "email":
            if len(sys.argv) != 3:
                print("Usage: python auth.py email <email>")
                sys.exit(1)
            email = sys.argv[2]
            is_valid = auth.validate_email(email)
            print(json.dumps({"is_valid": is_valid}))
            
        elif command == "info":
            if len(sys.argv) != 3:
                print("Usage: python auth.py info <hash>")
                sys.exit(1)
            hashed = sys.argv[2]
            info = auth.get_hash_info(hashed)
            print(json.dumps(info))
            
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
