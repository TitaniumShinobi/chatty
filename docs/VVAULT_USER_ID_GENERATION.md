# VVAULT User ID Generation

## Format

**LIFE Format**: `{normalized_name}_{timestamp}`

**Example**: `devon_woodson_1762969514958`

---

## Components

### 1. Normalized Name
- **Input**: User's name (e.g., "Devon Woodson")
- **Process**:
  1. Convert to lowercase
  2. Replace spaces with underscores
  3. Remove special characters (keep only alphanumeric + underscores)
  4. Collapse multiple underscores to single underscore
  5. Remove leading/trailing underscores
- **Output**: `devon_woodson`

### 2. Timestamp
- **Format**: Milliseconds since Unix epoch (`Date.now()`)
- **NOT hash-based** - uses actual timestamp when profile is created
- **NOT human-readable** - uses Unix epoch format, not `MMDDYYYYHHMMSS`
- **Example**: `1762969514958` = November 12, 2025, 12:45:14 PM EST
- **Human-readable equivalent**: `11122025124514` (MMDDYYYYHHMMSS format)

---

## Generation Logic

### JavaScript Implementation
```javascript
function generateLIFEUserId(name, email = null, timestamp = null) {
  const ts = timestamp || Date.now(); // Use actual timestamp, not hash
  let userName = 'user';
  
  if (name) {
    // Normalize name: lowercase, spaces → underscores, remove special chars
    userName = name.replace(/[^a-z0-9]/gi, '_')
                   .toLowerCase()
                   .replace(/_+/g, '_')
                   .replace(/^_|_$/g, '');
  } else if (email) {
    // Extract from email if name not available
    const emailName = email.split('@')[0]
                          .replace(/[^a-z0-9]/gi, '_')
                          .toLowerCase();
    if (emailName && emailName.length > 0) {
      userName = emailName;
    }
  }
  
  return `${userName}_${ts}`; // Format: name_timestamp
}
```

---

## Your VVAULT User ID

**User ID**: `devon_woodson_1762969514958`

**Breakdown**:
- **Name**: `devon_woodson` (normalized from "Devon Woodson")
- **Timestamp**: `1762969514958` (Unix epoch milliseconds)
- **Date**: November 12, 2025, 12:45:14 PM EST
- **Human-readable equivalent**: `11122025124514` (MMDDYYYYHHMMSS) - **NOT USED**

**Verification**:
```javascript
const timestamp = 1762969514958;
const date = new Date(timestamp);
console.log(date.toISOString()); // 2025-11-12T17:45:14.958Z
console.log(date.toLocaleString()); // 11/12/2025, 12:45:14 PM

// Why not human-readable?
const humanReadable = "11122025124514"; // MMDDYYYYHHMMSS
// Problems:
// - Not sortable as number
// - Timezone ambiguous
// - Format ambiguous (MMDD vs DDMM?)
// - No milliseconds precision
```

---

## Why Unix Epoch Milliseconds, Not Human-Readable Date?

**Your Question**: Why `1762969514958` instead of `11122025124514` (MMDDYYYYHHMMSS)?

**Unix Epoch Milliseconds Benefits**:
1. **Sortable**: Numeric comparison works (`1762969514958` < `1762969514959`)
2. **Timezone-independent**: Same value everywhere (UTC)
3. **Standard format**: Works across all systems/languages
4. **Easy calculations**: Can subtract timestamps to get duration
5. **Precise**: Millisecond precision (not just seconds)
6. **Debuggable**: Can convert to human-readable with `new Date(timestamp)`

**Human-Readable Format (`11122025124514`) Would**:
- ❌ Not sortable as number (string comparison needed)
- ❌ Timezone-dependent (which timezone?)
- ❌ Ambiguous format (MMDD vs DDMM?)
- ❌ Harder to calculate differences
- ❌ Less precise (no milliseconds)
- ❌ Not standard across systems

**Example Comparison**:
```javascript
// Unix epoch (current)
const ts1 = 1762969514958;
const ts2 = 1762969514959;
console.log(ts2 > ts1); // true (numeric comparison)

// Human-readable (hypothetical)
const hr1 = "11122025124514";
const hr2 = "11122025124515";
console.log(hr2 > hr1); // true BUT requires string comparison
// What about "11122025124514" vs "1112202512451"? Ambiguous!
```

**Conclusion**: Unix epoch milliseconds is the standard because it's sortable, timezone-independent, and works across all systems. Human-readable dates are for display, not IDs.

---

## Multi-Platform Considerations

**VVAULT User IDs are platform-agnostic**:
- Same user can have different VVAULT user IDs for different platforms
- VVAULT user ID is generated when VVAULT profile is created
- Not tied to Chatty, ChatGPT, or any specific platform
- Can be linked/unlinked from platform accounts via email

**Example**:
- Chatty account: `dwoodson92@gmail.com` → Chatty User ID: `devon_woodson_1762969514958`
- VVAULT account: `dwoodson92@gmail.com` → VVAULT User ID: `devon_woodson_1762969514958` (can be different!)
- User can disconnect Chatty and connect different email to VVAULT
- VVAULT operates independently

---

## Related Documentation

- `chatty/docs/PARALLEL_USER_REGISTRIES.md` - Parallel registry structure
- `wreck_vault/LIFE_technology/standards/USER_ID_FORMAT.md` - LIFE format standard

