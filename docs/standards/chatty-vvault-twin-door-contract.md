# Chatty VVAULT Twin Door Contract

This is the canonical runtime-topology contract for the Chatty and VVAULT relationship.

Chatty and VVAULT own this contract together. `auth/` does not own it. `auth/` may issue and validate `auth_sid`, but it does not define how Chatty and VVAULT find each other.

## Source Of Truth

- The mirrored runtime artifact is [`config/chatty-vvault-doors.json`](/Users/devonwoodson/Documents/GitHub/chatty/config/chatty-vvault-doors.json).
- Chatty selects exactly one door at startup.
- VVAULT validates the same door from its side.
- `POST /api/vault/session-bridge` is the canonical continuity bridge.
- Legacy Chatty session exchange is not part of the default browser/runtime path.

## Private Door

Use the private door for local canonical development only.

- Chatty public origin: `http://localhost:5173`
- Chatty API origin: `http://127.0.0.1:5050`
- Auth API origin: `http://127.0.0.1:1111`
- VVAULT origin: `http://127.0.0.1:8000`
- Cookie name: `auth_sid`

Private-door rule:
- local Chatty must find local auth and local VVAULT only
- production domains must not appear in private-door discovery

## Public Door

Use the public door for production canonical runtime only.

- Chatty public/API origin: `https://chatty.thewreck.org`
- Auth API/public origin: `https://auth.thewreck.org`
- VVAULT origin: `https://vvault.thewreck.org`
- Cookie name: `auth_sid`

Public-door rule:
- production Chatty must find production auth and production VVAULT only
- localhost and `127.0.0.1` must not appear in public-door discovery

## Loud Failure

Wrong-door states must fail closed and stay obvious. They must not silently cross from one door into the other.

Canonical mismatch reasons include:

- `door_public_with_localhost_target`
- `door_private_with_production_target`
- `vvault_origin_missing`
- `auth_origin_missing`
- `allowed_browser_origins_missing`
- `session_bridge_unreachable`

Fail-closed behavior is canonical:
- if the private door cannot reach local auth or local VVAULT, Chatty blocks honestly
- if the public door cannot reach production auth or production VVAULT, Chatty blocks honestly
- neither runtime may fall back to local conversation state and call that canonical continuity

## Boundary With Auth

`auth/` is a reusable provider-auth product.

`auth/` owns:
- provider login
- callback handling
- session issuance
- `/api/me`
- cookies such as `auth_sid`

`auth/` does not own:
- Chatty↔VVAULT discovery
- private/public door selection
- session-bridge topology
- VVAULT continuity authority rules
