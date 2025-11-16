# ChatGPT "My GPTs" Page Redesign Prompt

## Objective
Redesign Chatty's GPTs page (`chatty/src/pages/GPTsPage.tsx`) to match ChatGPT's "My GPTs" page design exactly, including layout, styling, and functionality.

## Reference Design (ChatGPT's "My GPTs" Page)

### Layout Structure
1. **Page Title**: "My GPTs" (large, bold font)
2. **No subtitle or description** - just the title
3. **No header action buttons** - buttons are on individual cards
4. **List/Grid Layout**: Cards displayed in a clean list/grid format

### Card Design
Each GPT card should have:
1. **Circular Avatar/Icon** (left side, ~40-48px)
   - GPT's avatar image if available
   - Fallback: Stylized icon based on GPT name/description
   
2. **GPT Name** (bold, prominent)
   - Directly next to or below avatar

3. **Description** (smaller text, muted)
   - Single line, truncated if too long

4. **Visibility Indicator** (small icon + text)
   - Lock icon + "Only me" for private GPTs
   - Globe icon + "Everyone" for public GPTs
   - Positioned below description or in top-right area

5. **Usage Count** (optional, if available)
   - Chat bubble icon + "X Chats" (e.g., "5 Chats", "4 Chats")
   - Only shown if usage > 0

6. **Action Buttons** (top-right corner of card)
   - **Edit icon** (pencil/edit icon) - opens edit modal
   - **Menu icon** (three dots) - dropdown menu with options
   - Both should be subtle, only visible on hover

### Special "Create a GPT" Card
The first card should be a special "Create a GPT" card:
- **Circular icon with "+" symbol** (centered)
- **Text**: "Create a GPT"
- **Description**: "Customize a version of ChatGPT for a specific purpose"
- **No action buttons** - clicking the card opens the GPT Creator
- **Different styling** - slightly different to indicate it's an action card

### Styling Requirements
1. **Dark theme** with clean, modern aesthetic
2. **Card hover effects** - subtle background change on hover
3. **Spacing**: Generous padding between cards
4. **Typography**: Clean, readable fonts matching ChatGPT's style
5. **Colors**: Use Chatty's existing CSS variables where possible
6. **Responsive**: Works on different screen sizes

## Current Implementation Location
- **File**: `chatty/src/pages/GPTsPage.tsx`
- **Service**: Uses `GPTService` from `chatty/src/lib/gptService.ts`
- **Components**: 
  - `GPTCreator` modal (already supports editing via `gptId` prop)
  - `SimForge` modal (keep as-is)

## Required Changes

### 1. Update Page Header
- Change title from "Your Custom Models" to **"My GPTs"**
- Remove subtitle "Manage and create custom AI assistants"
- Remove header action buttons ("Register Construct", "Create GPT")
- Keep it minimal - just the title

### 2. Redesign Card Layout
Replace the current grid card design with ChatGPT-style cards:
- Horizontal layout (avatar on left, content on right)
- Clean, minimal design
- Hover states for interactivity
- Edit and menu buttons (three dots) in top-right

### 3. Add "Create a GPT" Card
- First card in the list
- Special styling to indicate it's an action card
- Clicking opens GPT Creator (navigate to `/app/gpts/new`)

### 4. Add Visibility Indicators
- Check if GPT has `isPublic` field (may need to add to GPTConfig interface)
- Display lock icon + "Only me" for private (`isPublic: false`)
- Display globe icon + "Everyone" for public (`isPublic: true`)
- If field doesn't exist, default to "Only me" (private)

### 5. Add Usage Counts (Optional)
- If available, show conversation/usage count
- Format: Chat bubble icon + "X Chats"
- Only display if count > 0
- May need to query conversation data or add usage tracking

### 6. Update Action Buttons
- **Edit button**: Already implemented, ensure it's visible on hover
- **Menu button**: Add three-dot menu with options:
  - Edit
  - Delete
  - Duplicate (optional)
  - Share (if public, optional)

## Implementation Checklist

- [ ] Update page title to "My GPTs"
- [ ] Remove header subtitle and action buttons
- [ ] Create "Create a GPT" card as first item
- [ ] Redesign GPT cards to horizontal layout
- [ ] Add circular avatar display
- [ ] Add visibility indicators (lock/globe icons)
- [ ] Add usage count display (if data available)
- [ ] Update edit button styling (hover visible)
- [ ] Add three-dot menu button
- [ ] Implement menu dropdown with actions
- [ ] Ensure responsive design
- [ ] Test edit functionality
- [ ] Test delete functionality
- [ ] Match ChatGPT's visual style

## Technical Notes

1. **Icons**: Use `lucide-react` icons:
   - `Lock` for private
   - `Globe` for public
   - `MessageCircle` or `MessageSquare` for chat count
   - `Edit2` for edit
   - `MoreVertical` for menu
   - `Plus` for create card

2. **CSS Variables**: Use Chatty's existing CSS variables:
   - `var(--chatty-bg-main)` for background
   - `var(--chatty-text)` for text
   - `var(--chatty-line)` for borders
   - `var(--chatty-highlight)` for hover states

3. **Routing**: 
   - Create GPT: `/app/gpts/new`
   - Edit GPT: `/app/gpts/edit/:id`
   - Already implemented in current code

4. **Data Structure**: 
   - GPTs come from `gptService.getUserCreatedGPTs()`
   - Each GPT has: `id`, `name`, `description`, `avatar`, `instructions`, etc.
   - **Note**: `isPublic` field does NOT exist in current `GPTConfig` interface
   - For now, default all GPTs to "Only me" (private) until `isPublic` is added to the backend
   - Usage counts are also not currently tracked - can be added later or show "0 Chats" for all

## Acceptance Criteria

The redesigned page should:
1. Look visually identical to ChatGPT's "My GPTs" page
2. Have "Create a GPT" as the first card
3. Display all user GPTs with proper avatars, names, descriptions
4. Show visibility indicators (Only me/Everyone)
5. Show usage counts when available
6. Have working edit buttons that open the GPT Creator in edit mode
7. Have working menu buttons with delete option
8. Be fully responsive
9. Maintain all existing functionality (create, edit, delete)

## Files to Modify

1. `chatty/src/pages/GPTsPage.tsx` - Main page component
2. `chatty/src/lib/gptService.ts` - May need to add `isPublic` to `GPTConfig` interface if missing

## Example Card Structure (JSX)

```tsx
{/* Create GPT Card */}
<div className="gpt-card create-card" onClick={() => navigate('/app/gpts/new')}>
  <div className="avatar create-avatar">
    <Plus size={24} />
  </div>
  <div className="content">
    <h3>Create a GPT</h3>
    <p>Customize a version of ChatGPT for a specific purpose</p>
  </div>
</div>

{/* Regular GPT Card */}
<div className="gpt-card" onMouseEnter={showActions} onMouseLeave={hideActions}>
  <div className="avatar">
    {gpt.avatar ? <img src={gpt.avatar} /> : <BotIcon />}
  </div>
  <div className="content">
    <div className="header">
      <h3>{gpt.name}</h3>
      <div className="actions" style={{ opacity: isHovered ? 1 : 0 }}>
        <Edit2 onClick={() => handleEdit(gpt.id)} />
        <MoreVertical onClick={() => toggleMenu(gpt.id)} />
      </div>
    </div>
    <p className="description">{gpt.description}</p>
    <div className="metadata">
      {gpt.isPublic ? (
        <span><Globe size={14} /> Everyone</span>
      ) : (
        <span><Lock size={14} /> Only me</span>
      )}
      {usageCount > 0 && (
        <span><MessageCircle size={14} /> {usageCount} Chats</span>
      )}
    </div>
  </div>
  {/* Menu dropdown */}
  {showMenu === gpt.id && (
    <div className="menu-dropdown">
      <button onClick={() => handleEdit(gpt.id)}>Edit</button>
      <button onClick={() => handleDelete(gpt.id)}>Delete</button>
    </div>
  )}
</div>
```

## Start Implementation

Begin by:
1. Reading the current `GPTsPage.tsx` file
2. Understanding the existing structure and data flow
3. Redesigning the component to match ChatGPT's design
4. Testing all functionality (create, edit, delete)
5. Ensuring responsive design works on different screen sizes

