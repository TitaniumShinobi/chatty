# Address-Book Avatar Regression Checklist

Date: 2026-05-10

## Contract

- Address-book rows may render trusted backend/profile/VVAULT `/api/ais/:construct/avatar` routes for the same construct.
- No address-book row may invent a derived `/api/ais/:construct/avatar` route as a frontend display fallback.
- Sera is a normal GPT/construct for address-book display. She is not a special avatar type.
- Nova explicit avatar values must be preserved byte-for-byte.
- Sera, Nova, Katana, Hydro, and every other address-book row must render only explicit normalized avatar data from the profile/VVAULT identity source, including trusted same-construct avatar-serving routes.
- `Layout.tsx` owns address-book avatar assignment only by calling `resolveAddressBookAvatar`.
- `Sidebar.tsx` renders already-normalized `avatar` / `avatarUrl` values only. It must not build or choose canonical construct avatar routes.

## Old Failure Signature

This regression is not fixed if the browser console shows a non-Sera generated avatar request such as:

```text
GET http://localhost:5173/api/ais/nova-001/avatar 403 (Forbidden)
```

That request is a bug only when the address book invented the generated Nova avatar route instead of receiving it from backend/profile/VVAULT data. The same is true for a Sera request such as `/api/ais/sera-001/avatar?v=vvault-identity-v2`; that route may serve avatars, but it is not proof that VVAULT stores `avatar.png`.

## Required Checks

Run from `/Users/devonwoodson/Documents/GitHub/chatty`:

```bash
env -u npm_config_prefix PATH="/Users/devonwoodson/.nvm/versions/node/v20.20.1/bin:$PATH" \
  npm run test:avatar-guard
```

Then run:

```bash
env -u npm_config_prefix PATH="/Users/devonwoodson/.nvm/versions/node/v20.20.1/bin:$PATH" \
  npm run build -- --mode development
```

Both commands must pass before this area is considered guarded.

## Real Sera Acceptance Receipt

Sera is fixed only when VVAULT readback proves a materialized identity avatar:

- `filename` or `storagePath`: `instances/sera-001/identity/avatar.png`
- `contentType` / `mimeType`: `image/png`
- decoded content begins with PNG magic bytes: `89 50 4E 47 0D 0A 1A 0A`
- `pngMagicOk`: `true`

Local files, rewritten path strings, UI-visible images, and `/api/ais/sera-001/avatar?...` are not storage acceptance proof.

## Break It On Purpose Matrix

| Intentional bad change | Expected guard |
| --- | --- |
| Add a `/api/ais/nova-001/avatar` fallback in address-book policy. | `src/lib/addressBookAvatarPolicy.test.ts` rejects untrusted generated routes for every address-book contact. |
| Add a `/api/ais/sera-001/avatar?...` fallback in address-book policy. | `src/lib/addressBookAvatarPolicy.test.ts` and `src/lib/addressBookAvatarSourceGuard.test.ts` fail. |
| Add `constructId === "sera-001"` as an address-book avatar exception. | `src/lib/addressBookAvatarSourceGuard.test.ts` fails. |
| Let Sera without an avatar derive `/api/ais/sera-001/avatar`. | `src/lib/addressBookAvatarPolicy.test.ts` keeps Sera no-avatar fallback at `null`. |
| Let Nova without an avatar derive `/api/ais/nova-001/avatar`. | `src/lib/addressBookAvatarPolicy.test.ts` keeps Nova no-avatar fallback at `null`. |
| Let Katana or Hydro without avatars derive generated construct routes. | `src/lib/addressBookAvatarPolicy.test.ts` keeps Katana/Hydro no-avatar fallback at `null`. |
| Preserve stale `/api/ais/katana-001/avatar?...` for Katana. | `src/lib/addressBookAvatarPolicy.test.ts` rejects stale generated canonical routes. |
| Let Hydro receive `/api/ais/sera-001/avatar?...`. | `src/lib/addressBookAvatarPolicy.test.ts` rejects every generated route for every address-book contact. |
| Render trusted `/api/ais/nova-001/avatar?...` for Nova from backend/profile data. | `src/lib/addressBookAvatarPolicy.test.ts` keeps trusted same-construct backend routes green. |
| Treat `avatar.webp` path presence as equivalent to real `avatar.png`. | VVAULT avatar canonicalization tests fail because WebP is migration source only. |
| Import or call `buildCanonicalConstructAvatarUrl` in `Layout.tsx`. | `src/lib/addressBookAvatarSourceGuard.test.ts` production-source scan fails. |
| Import or call `buildCanonicalConstructAvatarUrl` in `Sidebar.tsx`. | `src/lib/addressBookAvatarSourceGuard.test.ts` production-source scan fails. |
| Add raw `/api/ais/.../avatar` policy to `Layout.tsx` or `Sidebar.tsx`. | `src/lib/addressBookAvatarSourceGuard.test.ts` production-source scan fails. |
| Move `resolveAddressBookAvatar` ownership into `Sidebar.tsx`. | `src/lib/addressBookAvatarSourceGuard.test.ts` rejects resolver use in Sidebar. |
| Make Sidebar render only provided normalized `avatar` / `avatarUrl`. | `src/lib/addressBookAvatarSourceGuard.test.ts` clean fixture remains green. |

## Acceptance

- Clean repo behavior passes `npm run test:avatar-guard`.
- Clean repo behavior passes `npm run build -- --mode development`.
- VVAULT canonicalization tests prove WebP converts into PNG bytes and body identity exposes only materialized `avatar.png` as the avatar descriptor.
- Each intentional bad mutation above fails at least one named guard test.
- A visual check is still useful, but it is not the guard. The guard is the automated failure before merge or ship.

## Caveat

This does not mean the avatar path is impossible to break. It means this specific regression class cannot break silently when `npm run test:avatar-guard` is run. The final hardening step is making that command and the VVAULT canonicalization tests mandatory in CI or the local pre-push/ship checklist.
