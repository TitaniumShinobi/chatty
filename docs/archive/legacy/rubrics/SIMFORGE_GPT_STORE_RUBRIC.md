# SimForge GPT Store Rubric

## Core Principle

**SimForge is a public discovery platform for community-created AI constructs, not a private AI management interface.**

SimForge displays AI constructs that have been explicitly published to the GPT Store (privacy='store'). It serves as a marketplace where users can discover, explore, and interact with AIs created by the community.

## Definition

### SimForge Purpose
- **Public Discovery**: Shows AI constructs available to all users
- **Store Integration**: Only displays AIs with `privacy='store'`
- **Community Hub**: Functions as a marketplace for shared AI constructs
- **Search & Filter**: Enables discovery through search, categories, and sorting

### Display Format
- **AI Cards**: Shows AI name, description, avatar, and metadata
- **Privacy Status**: Only shows AIs explicitly published to store
- **User's Own AIs**: Separated section showing user's personal AIs (regardless of privacy)
- **Community AIs**: Main section showing all store-published AIs from all users

## Rules

### 1. Privacy-Based Visibility
- **Store AIs Only**: Only AIs with `privacy='store'` appear in main community section
- **Private AIs Hidden**: AIs with `privacy='private'` never appear in SimForge
- **Link-Shared AIs Hidden**: AIs with `privacy='link'` never appear in SimForge
- **Explicit Publishing Required**: User must explicitly select "GPT Store" option when saving
- **Privacy Check**: Backend filters by `privacy='store'` in database query

### 2. Data Source
- **API Endpoint**: Fetches from `GET /api/ais/store`
- **Backend Method**: Uses `AIManager.getStoreAIs()` method
- **Dual-Table Support**: Queries both `ais` and `gpts` tables for backward compatibility
- **Real-Time Data**: Always fetches fresh data from database, no caching
- **No Mock Data**: Removed mock/placeholder data in favor of real API calls

### 3. User's Own AIs Section
- **Separate Display**: User's personal AIs shown in "Your GPTs" section
- **All Privacy Levels**: Shows user's AIs regardless of privacy setting
- **Distinct from Community**: Clearly separated from community AIs
- **Personal Management**: User can see their own AIs even if not published

### 4. Community AI Display
- **Author Information**: Shows AI creator (author field)
- **Engagement Metrics**: Displays likes, downloads (when implemented)
- **Category & Tags**: Shows categorization for filtering
- **Avatar Display**: Shows AI profile image
- **Description**: Shows AI purpose/description

### 5. Search & Filter Functionality
- **Search Bar**: Filters by name, description, or tags
- **Category Filter**: Dropdown to filter by category
- **Sort Options**: Trending, Newest, Popular
- **View Modes**: Grid view and List view
- **Real-Time Filtering**: Updates as user types/selections change

### 6. Privacy Selection Flow
- **Save Modal**: When user clicks "Save GPT", privacy modal appears
- **Three Options**: 
  - "Only me" → `privacy='private'`
  - "Anyone with link" → `privacy='link'`
  - "GPT Store" → `privacy='store'`
- **Selection Required**: User must choose before saving
- **Persistence**: Privacy setting saved to database and reflected in AI card

## Implementation

### Code Location

**Frontend Component** (`SimForge.tsx`):
- Main component for GPT Store interface
- Uses `AIService.getInstance()` for API calls
- Maps store AIs to `CommunityGPT` interface format

**Backend API Endpoint** (`chatty/server/routes/ais.js`):
```javascript
router.get('/store', async (req, res) => {
  try {
    const storeAIs = await aiManager.getStoreAIs();
    res.json({ success: true, ais: storeAIs });
  } catch (error) {
    console.error('Error fetching store AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Backend Manager Method** (`chatty/server/lib/aiManager.js`):
```javascript
async getStoreAIs() {
  // Query both ais and gpts tables for AIs with privacy='store'
  const aisStmt = this.db.prepare(`
    SELECT * FROM ais 
    WHERE privacy = 'store' 
    ORDER BY updated_at DESC
  `);
  // ... processes and returns store AIs
}
```

**Frontend Service** (`chatty/src/lib/aiService.ts`):
```typescript
async getStoreAIs(): Promise<AIConfig[]> {
  const response = await fetch(`${this.baseUrl}/store`);
  const data = await response.json();
  return data.ais;
}
```

### Privacy Field Storage

**Database Schema**:
- `privacy` column added to both `ais` and `gpts` tables
- Default value: `'private'`
- Valid values: `'private'`, `'link'`, `'store'`
- Migration: Backfills existing rows based on `isActive` status

**Privacy to isActive Mapping**:
- `privacy='private'` → `isActive=false`
- `privacy='link'` → `isActive=true`
- `privacy='store'` → `isActive=true`

### Data Flow

1. **User Publishes AI**:
   - User creates/edits AI in GPTCreator
   - Clicks "Save GPT"
   - Selects "GPT Store" in privacy modal
   - `privacy='store'` saved to database

2. **SimForge Loads**:
   - Calls `aiService.getStoreAIs()`
   - Backend queries `WHERE privacy = 'store'`
   - Returns all store-published AIs
   - Frontend displays in community section

3. **User's Own AIs**:
   - Calls `aiService.getAllAIs()` with user context
   - Shows all user's AIs in "Your GPTs" section
   - Independent of privacy setting

### Privacy Display

**AI Card Privacy Indicator** (`GPTsPage.tsx`):
- Lock icon + "Only me" for `privacy='private'`
- Link2 icon + "Anyone with link" for `privacy='link'`
- Store icon + "GPT Store" for `privacy='store'`

**Privacy Selection Modal** (`GPTCreator.tsx`):
- Three radio button options
- Required selection before save
- Saves `privacy` field to database

## Relationship to Other Rubrics

### Privacy Settings Implementation
- Privacy selection in GPTCreator determines SimForge visibility
- Privacy field stored in database and returned in API responses
- Privacy display on AI cards reflects current setting

### AI Creation Rubric
- GPTCreator component handles privacy selection
- Privacy setting saved during AI creation/update
- Privacy modal appears on "Save GPT" click

### Address Book Rubric
- Address Book shows user's personal AIs (all privacy levels)
- SimForge shows community AIs (store privacy only)
- Different purposes: Address Book = personal directory, SimForge = public marketplace

## Display Examples

### Correct SimForge Display
```
SimForge
├── Header
│   ├── "My GPTs" button → navigates to GPTsPage
│   └── "+ Create GPT" button → opens GPTCreator
├── Search & Filters
│   ├── Search bar
│   ├── Category dropdown
│   ├── Sort options (Trending/Newest/Popular)
│   └── View mode (Grid/List)
├── Your GPTs Section (if user has AIs)
│   └── Shows user's AIs regardless of privacy
└── Community AIs Section
    ├── AI Card (privacy='store')
    ├── AI Card (privacy='store')
    └── AI Card (privacy='store')
```

### Incorrect SimForge Display
```
SimForge
├── Shows AI with privacy='private'  ❌ (should not appear)
├── Shows AI with privacy='link'    ❌ (should not appear)
└── Shows mock/placeholder data      ❌ (should use real API)
```

### Privacy Selection Flow
```
User clicks "Save GPT"
  ↓
Privacy Modal appears
  ├── ○ Only me
  ├── ○ Anyone with link
  └── ● GPT Store  ← User selects this
  ↓
AI saved with privacy='store'
  ↓
AI appears in SimForge community section
```

## Testing

### Privacy-Based Visibility
- ✅ Only AIs with `privacy='store'` appear in SimForge
- ✅ AIs with `privacy='private'` do not appear in SimForge
- ✅ AIs with `privacy='link'` do not appear in SimForge
- ✅ Privacy selection in GPTCreator correctly saves to database
- ✅ Privacy setting persists after page reload

### Data Fetching
- ✅ SimForge fetches from `/api/ais/store` endpoint
- ✅ Backend correctly filters by `privacy='store'`
- ✅ Dual-table support works (ais and gpts tables)
- ✅ No mock data used, only real API responses
- ✅ Error handling for failed API calls

### User Experience
- ✅ User's own AIs shown in separate section
- ✅ Community AIs shown in main section
- ✅ Search filters work correctly
- ✅ Category filter works correctly
- ✅ Sort options work correctly
- ✅ Grid/List view toggle works
- ✅ Privacy indicator shows on AI cards

### Privacy Selection
- ✅ Privacy modal appears on "Save GPT" click
- ✅ Three privacy options available
- ✅ Selection required before save
- ✅ Privacy setting saved to database
- ✅ Privacy reflected in AI card display

## Future Enhancements

### Planned Features
- **Likes System**: Track and display likes for store AIs
- **Downloads Tracking**: Track how many times AI is downloaded
- **Author Information**: Display actual author name/avatar from user data
- **Category System**: Extract categories from AI metadata
- **Tags System**: Extract tags from AI metadata
- **Rating System**: Allow users to rate store AIs
- **Reviews**: Allow users to leave reviews for store AIs
- **Trending Algorithm**: Implement trending based on engagement
- **Featured Section**: Highlight featured/popular AIs

### Data Structure Extensions
```typescript
interface CommunityGPT extends AIConfig {
  author: string;              // TODO: Get from user data
  authorAvatar?: string;       // TODO: Get from user profile
  likes: number;               // TODO: Implement likes system
  downloads: number;           // TODO: Implement downloads tracking
  isLiked?: boolean;           // TODO: Check if current user liked
  isDownloaded?: boolean;      // TODO: Check if current user downloaded
  category: string;            // TODO: Extract from metadata
  tags: string[];              // TODO: Extract from metadata
}
```

## Summary

**SimForge is a public discovery platform.** This means:
- Only displays AIs explicitly published to store (`privacy='store'`)
- Fetches real data from database via API, no mock data
- Separates user's own AIs from community AIs
- Provides search, filter, and sort functionality
- Privacy selection in GPTCreator determines SimForge visibility
- Privacy setting persists and is reflected in UI
- Future enhancements will add engagement metrics and social features

---

*Last Updated: November 2025*
*Component: SimForge.tsx*
*API Endpoint: GET /api/ais/store*
*Privacy Field: Required for store visibility*

