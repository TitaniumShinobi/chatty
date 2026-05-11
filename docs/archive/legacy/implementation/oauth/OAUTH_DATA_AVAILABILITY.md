# OAuth Data Availability in Chatty

## Current OAuth Scopes Requested

Chatty requests these scopes from Google OAuth:
```
openid email profile
```

## What Google OAuth Provides (with current scopes)

When you authenticate with Google OAuth using the `openid email profile` scopes, Google's `/oauth2/v3/userinfo` endpoint returns:

### Currently Used by Chatty ✅
- **`sub`** - Unique Google user ID (stored as `uid`)
- **`email`** - Email address (stored)
- **`name`** - Full display name (stored)
- **`picture`** - Profile picture URL (stored)

### Available but NOT Currently Stored ⚠️
- **`given_name`** - First name (e.g., "Devon")
- **`family_name`** - Last name (e.g., "Woodson")
- **`locale`** - Language/locale preference (e.g., "en-US")
- **`email_verified`** - Boolean indicating if email is verified

### What's NOT Available (requires additional scopes)
- ❌ **Contacts** - Requires `https://www.googleapis.com/auth/contacts.readonly`
- ❌ **Calendar** - Requires `https://www.googleapis.com/auth/calendar.readonly`
- ❌ **Drive Files** - Requires `https://www.googleapis.com/auth/drive.readonly`
- ❌ **Gmail** - Requires `https://www.googleapis.com/auth/gmail.readonly`
- ❌ **YouTube** - Requires `https://www.googleapis.com/auth/youtube.readonly`
- ❌ **Photos** - Requires `https://www.googleapis.com/auth/photoslibrary.readonly`
- ❌ **Phone Number** - Requires `https://www.googleapis.com/auth/user.phonenumbers.read`
- ❌ **Address** - Requires `https://www.googleapis.com/auth/user.addresses.read`
- ❌ **Birthday** - Requires `https://www.googleapis.com/auth/user.birthday.read`
- ❌ **Gender** - Requires `https://www.googleapis.com/auth/user.gender.read`

## Current Implementation

### What Chatty Stores (MongoDB User Model)
```javascript
{
  uid: String,        // Google sub
  name: String,       // Full display name
  email: String,      // Email address
  picture: String,    // Profile picture URL
  emailVerified: Boolean,  // Currently set to true for OAuth users
  provider: String,   // "google"
  tier: String        // "free"|"pro"|"enterprise"
}
```

### What Chatty Stores (VVAULT Profile)
```json
{
  "user_id": "devon_woodson_1762969514958",
  "chatty_user_id": "109043688581425242997",
  "email": "dwoodson92@gmail.com",
  "name": "Devon Woodson",  // NEW: Now stored after recent fix
  "created_at": "2025-11-24T08:11:39.864Z",
  "source": "chatty_auto_creation"
}
```

## Summary

**Answer: No, not everything from your Google account is brought over.**

Chatty only requests and stores:
- ✅ Basic profile info (name, email, picture)
- ✅ Unique identifier (sub)

**Not stored (but available):**
- ⚠️ First name (`given_name`)
- ⚠️ Last name (`family_name`)
- ⚠️ Locale preference (`locale`)

**Not available (requires additional scopes):**
- ❌ Contacts, Calendar, Drive, Gmail, YouTube, Photos, Phone, Address, Birthday, Gender, etc.

## Recommendations

To use more Google account data, you would need to:
1. Request additional scopes in the OAuth flow
2. Update the User model to store additional fields
3. Update VVAULT profile to include additional fields
4. Handle user consent for additional permissions

**Privacy Note:** Requesting additional scopes requires explicit user consent and may reduce sign-up conversion rates. Only request what's necessary for your application's functionality.

