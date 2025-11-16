# Community GPTs Structure

## Overview

Community GPTs are shared, public AI assistants that can be discovered and used by any Chatty user. They are separate from:
- **User-created GPTs**: Custom GPTs created by individual users for their own use
- **Imported runtimes**: GPTs created from imported ChatGPT/Gemini/etc. archives

## Storage Structure

### Database Schema

Community GPTs are stored in the same `gpts` table as user GPTs, but with special flags:

```sql
CREATE TABLE gpts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  conversation_starters TEXT,
  avatar TEXT,
  capabilities TEXT,
  model_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 0,      -- Can be shared/discovered
  is_community INTEGER DEFAULT 0,   -- Featured community GPT
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT NOT NULL            -- Creator's user ID
)
```

### File Structure

Community GPTs configurations are stored separately from VVAULT transcripts:

```
chatty/
├── community-gpts/              # Community GPT configurations
│   ├── featured/                # Featured/curated GPTs
│   │   ├── trip-advisor.json
│   │   ├── canva.json
│   │   ├── monday.json
│   │   └── media-generator.json
│   ├── trending/                # Popular GPTs
│   └── categories/              # Categorized GPTs
│       ├── productivity/
│       ├── creative/
│       ├── travel/
│       └── media/
└── gpt-uploads/                  # User-uploaded files for GPTs
```

## Community GPT Categories

### Featured GPTs (Built-in)
These are curated GPTs that come with Chatty:

1. **Trip Advisor** - Combination of travel sites
   - Category: Travel
   - Capabilities: Web search, image generation

2. **Canva** - Design assistant
   - Category: Creative
   - Capabilities: Image generation, canvas

3. **Monday** - Project management
   - Category: Productivity
   - Capabilities: Web search, code interpreter

4. **Media Generator** - Image, music, and video generation
   - Category: Media
   - Capabilities: Image generation, audio generation, video generation
   - Purpose: Reduce load on Synth runtime for media generation requests

## API Endpoints

### Community GPTs
- `GET /api/gpts/community` - Get all community GPTs
- `GET /api/gpts/community/featured` - Get featured GPTs
- `GET /api/gpts/community/trending` - Get trending GPTs
- `GET /api/gpts/community/:category` - Get GPTs by category
- `POST /api/gpts/:id/share` - Share a user GPT to community (sets `is_public`)
- `POST /api/gpts/:id/unshare` - Remove GPT from community

### User GPTs
- `GET /api/gpts` - Get all user GPTs (includes user-created and imported runtimes)
- `GET /api/gpts/user-created` - Get only user-created GPTs (excludes imported runtimes)
- `GET /api/gpts/imported` - Get only imported runtimes

## Frontend Pages

### `/app/explore` - Explore Page
- Shows community GPTs
- Search and filter by category
- "My GPTs" button links to `/app/gpts`
- "+ Create GPT" button opens GPT creator

### `/app/gpts` - My GPTs Page
- Shows only user-created GPTs (excludes imported runtimes)
- Manage, edit, delete user's GPTs
- "+ Create GPT" button opens GPT creator

## Identification Logic

### Imported Runtime Detection
A GPT is considered an imported runtime if:
1. It has an `import-metadata.json` file in its `files` array, OR
2. Its name matches the pattern: `{email} — {Provider}` (e.g., "devon@thewreck.org — ChatGPT")

### User-Created GPT Detection
A GPT is user-created if:
1. It does NOT have `import-metadata.json` file, AND
2. It does NOT match the imported runtime name pattern

### Community GPT Detection
A GPT is a community GPT if:
1. `is_public === 1` OR `is_community === 1` in the database

## Future Enhancements

- [ ] Community GPT rating system
- [ ] GPT sharing/export functionality
- [ ] Community GPT moderation
- [ ] GPT marketplace with categories
- [ ] Usage analytics for community GPTs
- [ ] GPT versioning system

