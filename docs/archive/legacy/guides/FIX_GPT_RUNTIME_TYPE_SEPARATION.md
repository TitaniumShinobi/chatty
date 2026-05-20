# Fix GPT/Runtime Type Separation

## Problem
GPTs and Runtimes are being stored in the same `gpts` table without explicit type distinction. The current filtering logic relies on heuristics (checking for `import-metadata.json` files or name patterns), which is unreliable and causes:
- User-created GPTs appearing as runtimes
- Imported runtimes appearing as GPTs
- Inconsistent filtering behavior

## Solution
Add an explicit `type` field to the database schema to distinguish between:
- `'gpt'` - User-created custom GPTs (from GPT Creator)
- `'runtime'` - Imported runtimes (from imports)

## Implementation Steps

### 1. Database Migration
Add `type` column to `gpts` table:

```sql
ALTER TABLE gpts ADD COLUMN type TEXT DEFAULT 'gpt';
```

Update existing records:
- If has `import-metadata.json` file → set `type = 'runtime'`
- Otherwise → set `type = 'gpt'` (default)

### 2. Update GPTManager.createGPT()
Add `type` parameter (defaults to `'gpt'`):

```javascript
async createGPT(config, type = 'gpt') {
  // ... existing code ...
  const stmt = this.db.prepare(`
    INSERT INTO gpts (id, name, description, instructions, conversation_starters, avatar, capabilities, model_id, is_active, created_at, updated_at, user_id, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    // ... existing params ...
    type // Add type as last parameter
  );
}
```

### 3. Update importService.createImportedRuntime()
Explicitly set `type = 'runtime'`:

```javascript
const gpt = await gptManager.createGPT({
  // ... existing config ...
}, 'runtime'); // Explicitly mark as runtime
```

### 4. Update GPT Creator (POST /api/gpts)
Ensure it creates with `type = 'gpt'`:

```javascript
const gpt = await gptManager.createGPT(gptData, 'gpt'); // Explicitly mark as GPT
```

### 5. Update Filtering Logic
Replace heuristic-based filtering with type-based:

```typescript
// In gptService.ts
isImportedRuntime(gpt: GPTConfig): boolean {
  return gpt.type === 'runtime'; // Simple type check
}

async getUserCreatedGPTs(): Promise<GPTConfig[]> {
  const allGpts = await this.getAllGPTs()
  return allGpts.filter(gpt => gpt.type === 'gpt') // Filter by type
}

async getImportedRuntimes(): Promise<GPTConfig[]> {
  const allGpts = await this.getAllGPTs()
  return allGpts.filter(gpt => gpt.type === 'runtime') // Filter by type
}
```

### 6. Update GPTConfig Interface
Add `type` field:

```typescript
export interface GPTConfig {
  // ... existing fields ...
  type?: 'gpt' | 'runtime'; // Add type field
}
```

### 7. Migration Script
Create a migration to set types for existing records:

```javascript
// In gptManager.js initialization
async migrateExistingRecords() {
  const allGpts = this.db.prepare('SELECT id FROM gpts').all();
  
  for (const gpt of allGpts) {
    const files = await this.getGPTFiles(gpt.id);
    const hasImportMetadata = files.some(f => 
      f.name === 'import-metadata.json' || 
      f.originalName === 'import-metadata.json'
    );
    
    const type = hasImportMetadata ? 'runtime' : 'gpt';
    this.db.prepare('UPDATE gpts SET type = ? WHERE id = ?').run(type, gpt.id);
  }
}
```

## Files to Modify

1. `chatty/server/lib/gptManager.js`
   - Add `type` column to schema
   - Update `createGPT()` to accept and store `type`
   - Add migration logic for existing records
   - Update `getGPT()` to return `type` field

2. `chatty/server/services/importService.js`
   - Update `createImportedRuntime()` to pass `type = 'runtime'`

3. `chatty/server/routes/gpts.js`
   - Update `POST /` to pass `type = 'gpt'` when creating GPTs

4. `chatty/src/lib/gptService.ts`
   - Add `type` to `GPTConfig` interface
   - Update `isImportedRuntime()` to use type check
   - Update filtering methods to use type

## Testing Checklist

- [ ] Migration runs successfully on existing database
- [ ] New GPTs created via GPT Creator have `type = 'gpt'`
- [ ] New runtimes created via import have `type = 'runtime'`
- [ ] `getUserCreatedGPTs()` only returns GPTs (type = 'gpt')
- [ ] `getImportedRuntimes()` only returns runtimes (type = 'runtime')
- [ ] Existing records are properly migrated
- [ ] No data loss during migration

## Rollback Plan

If issues occur:
1. The `type` column can be nullable (defaults to NULL)
2. Fallback to heuristic-based filtering if `type` is NULL
3. Migration can be re-run safely (idempotent)

