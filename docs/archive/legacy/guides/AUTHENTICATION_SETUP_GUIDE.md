# Authentication Setup Guide for CleanHouse

Based on Chatty's authentication implementation, this guide provides a comprehensive approach to setting up authentication for your Flask/Python desktop application.

## Architecture Overview

**Chatty's Approach:**
- **Backend**: JWT tokens stored in HTTP-only cookies
- **Frontend**: localStorage cache + `/api/me` endpoint for verification
- **OAuth**: Server-side redirect flow with callback handling
- **Session**: 30-day expiration, auto-refresh on verification

## 1. Session Management

### Backend (Flask)

**Use JWT tokens in HTTP-only cookies** - This is more secure than localStorage tokens and works well with desktop apps.

```python
# backend/api/auth.py
import jwt
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from functools import wraps

auth_bp = Blueprint('auth', __name__)

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
COOKIE_NAME = os.getenv('COOKIE_NAME', 'sid')
COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 days in seconds

def create_session_token(user_data):
    """Create JWT token with user data"""
    payload = {
        'sub': user_data['id'],  # Subject (user ID) - always use 'sub' for consistency
        'id': user_data['id'],
        'email': user_data['email'],
        'name': user_data.get('name', ''),
        'picture': user_data.get('picture'),
        'provider': user_data.get('provider', 'email'),
        'iat': datetime.utcnow(),  # Issued at
        'exp': datetime.utcnow() + timedelta(days=30)  # Expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def set_auth_cookie(response, token):
    """Set HTTP-only cookie with JWT token"""
    response.set_cookie(
        COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,  # Critical: prevents XSS attacks
        samesite='Lax',  # CSRF protection
        secure=os.getenv('FLASK_ENV') == 'production',  # HTTPS only in production
        path='/'
    )
    return response

def require_auth(f):
    """Decorator to protect routes requiring authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.cookies.get(COOKIE_NAME)
        if not token:
            return jsonify({'ok': False, 'error': 'Authentication required'}), 401
        
        try:
            # Verify and decode JWT
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            
            # Ensure 'sub' exists (for consistency)
            if not payload.get('sub'):
                payload['sub'] = payload.get('id') or payload.get('email')
            
            # Attach user to request
            request.user = payload
            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'ok': False, 'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'ok': False, 'error': 'Invalid token'}), 401
    
    return decorated_function

# Session verification endpoint
@auth_bp.route('/api/me', methods=['GET'])
def get_current_user():
    """Check if user is authenticated and return user data"""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return jsonify({'ok': False}), 401
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        
        # Ensure 'sub' exists
        if not payload.get('sub'):
            payload['sub'] = payload.get('id') or payload.get('email')
        
        return jsonify({'ok': True, 'user': payload})
    except jwt.ExpiredSignatureError:
        return jsonify({'ok': False, 'error': 'Token expired'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'ok': False, 'error': 'Invalid token'}), 401
```

### Frontend (JavaScript)

**Cache session in localStorage, verify with backend:**

```javascript
// frontend/js/auth.js

const API_BASE = '/api';

/**
 * Get current user - checks cache first, then verifies with backend
 */
async function getCurrentUser() {
    // Check localStorage cache first (instant, no backend needed)
    try {
        const cachedSession = localStorage.getItem('auth:session');
        if (cachedSession) {
            const sessionData = JSON.parse(cachedSession);
            if (sessionData?.user) {
                console.log('⚡ Using cached session:', sessionData.user.email);
                
                // Return cached session immediately, verify in background
                verifySessionInBackground(sessionData.user);
                return sessionData.user;
            }
        }
    } catch (error) {
        console.warn('Invalid cached session, checking API');
    }
    
    // No cache, check API
    try {
        const response = await fetch(`${API_BASE}/me`, {
            credentials: 'include'  // Critical: sends cookies
        });
        
        if (!response.ok) {
            localStorage.removeItem('auth:session');
            return null;
        }
        
        const data = await response.json();
        if (data.ok && data.user) {
            // Ensure 'sub' field exists
            const user = {
                ...data.user,
                sub: data.user.sub || data.user.id || data.user.email
            };
            
            // Cache session
            localStorage.setItem('auth:session', JSON.stringify({ user }));
            return user;
        }
        
        localStorage.removeItem('auth:session');
        return null;
    } catch (error) {
        console.error('Failed to check session:', error);
        
        // If connection error and we have cache, use it
        const cachedSession = localStorage.getItem('auth:session');
        if (cachedSession) {
            try {
                const sessionData = JSON.parse(cachedSession);
                if (sessionData?.user) {
                    console.log('⚡ Backend not ready, using cached session');
                    return sessionData.user;
                }
            } catch {}
        }
        
        return null;
    }
}

/**
 * Verify session with backend in background (non-blocking)
 */
async function verifySessionInBackground(user) {
    try {
        const response = await fetch(`${API_BASE}/me`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.ok && data.user) {
                // Update cache with fresh data
                const freshUser = {
                    ...data.user,
                    sub: data.user.sub || data.user.id || data.user.email
                };
                localStorage.setItem('auth:session', JSON.stringify({ user: freshUser }));
            } else {
                // Session invalid, clear cache
                localStorage.removeItem('auth:session');
            }
        }
    } catch (error) {
        // Silently fail - verification is optional
        console.debug('Background verification failed (non-critical)');
    }
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
    const user = await getCurrentUser();
    return user !== null;
}
```

## 2. OAuth Flow Completion

### Backend (Flask)

**OAuth callback handler:**

```python
# backend/api/auth.py

@auth_bp.route('/api/auth/<provider>/callback', methods=['GET'])
def oauth_callback(provider):
    """Handle OAuth callback from provider"""
    code = request.args.get('code')
    error = request.args.get('error')
    
    if error:
        return redirect(f'{FRONTEND_URL}/login?error={error}')
    
    if not code:
        return redirect(f'{FRONTEND_URL}/login?error=no_code')
    
    try:
        # 1. Exchange code for access token
        token_data = exchange_code_for_token(provider, code)
        
        # 2. Get user profile from provider
        profile = get_user_profile(provider, token_data['access_token'])
        
        # 3. Find or create user in your database
        user = find_or_create_user(profile, provider)
        
        # 4. Create session token
        user_data = {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
            'picture': profile.get('picture'),
            'provider': provider
        }
        token = create_session_token(user_data)
        
        # 5. Create response with cookie
        response = make_response(redirect(f'{FRONTEND_URL}/'))
        response = set_auth_cookie(response, token)
        
        # 6. Cache user data in response (optional, for frontend)
        response.set_cookie(
            'user_data',
            value=json.dumps(user_data),
            max_age=COOKIE_MAX_AGE,
            httponly=False,  # Can be read by JS
            samesite='Lax',
            secure=os.getenv('FLASK_ENV') == 'production',
            path='/'
        )
        
        return response
        
    except Exception as e:
        print(f'OAuth callback error: {e}')
        return redirect(f'{FRONTEND_URL}/login?error=oauth_failed')

def exchange_code_for_token(provider, code):
    """Exchange OAuth code for access token"""
    if provider == 'google':
        # Google OAuth token exchange
        token_url = 'https://oauth2.googleapis.com/token'
        data = {
            'code': code,
            'client_id': os.getenv('GOOGLE_CLIENT_ID'),
            'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
            'redirect_uri': os.getenv('GOOGLE_REDIRECT_URI'),
            'grant_type': 'authorization_code'
        }
        response = requests.post(token_url, data=data)
        return response.json()
    
    elif provider == 'microsoft':
        # Microsoft OAuth token exchange
        token_url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
        # ... similar implementation
    
    # Add other providers...

def get_user_profile(provider, access_token):
    """Get user profile from provider"""
    if provider == 'google':
        profile_url = 'https://www.googleapis.com/oauth2/v2/userinfo'
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get(profile_url, headers=headers)
        return response.json()
    
    # Add other providers...
```

### Frontend (JavaScript)

**OAuth initiation:**

```javascript
// frontend/js/auth.js

/**
 * Initiate OAuth login
 */
function loginWithOAuth(provider) {
    // Hard navigate so cookies flow through
    // Server will handle redirect and set cookie
    window.location.href = `/api/auth/${provider}`;
}

/**
 * Handle OAuth callback (if needed)
 */
function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error) {
        showError(`OAuth login failed: ${error}`);
        return;
    }
    
    // Session cookie is already set by backend
    // Just verify and redirect
    getCurrentUser().then(user => {
        if (user) {
            window.location.href = '/dashboard';
        } else {
            showError('Failed to verify session');
        }
    });
}
```

## 3. Login/Signup Form Submission

### Backend (Flask)

```python
# backend/api/auth.py

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    """Email/password login"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'ok': False, 'error': 'Email and password required'}), 400
    
    # Find user
    user = UserService.find_by_email(email)
    if not user:
        return jsonify({'ok': False, 'error': 'Invalid credentials'}), 401
    
    # Verify password
    if not verify_password(password, user.password_hash):
        return jsonify({'ok': False, 'error': 'Invalid credentials'}), 401
    
    # Create session token
    user_data = {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'provider': 'email'
    }
    token = create_session_token(user_data)
    
    # Set cookie
    response = jsonify({'ok': True, 'user': user_data})
    response = set_auth_cookie(response, token)
    
    return response

@auth_bp.route('/api/auth/createAccount', methods=['POST'])
def create_account():
    """Email/password signup"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    confirm_password = data.get('confirmPassword')
    name = data.get('name')
    
    # Validation
    if not all([email, password, confirm_password, name]):
        return jsonify({'ok': False, 'error': 'All fields required'}), 400
    
    if password != confirm_password:
        return jsonify({'ok': False, 'error': 'Passwords do not match'}), 400
    
    if len(password) < 8:
        return jsonify({'ok': False, 'error': 'Password must be at least 8 characters'}), 400
    
    # Check if user exists
    existing_user = UserService.find_by_email(email)
    if existing_user:
        return jsonify({'ok': False, 'error': 'User already exists'}), 400
    
    # Create user
    password_hash = hash_password(password)
    user = UserService.create({
        'email': email,
        'name': name,
        'password_hash': password_hash,
        'provider': 'email'
    })
    
    # Create session token
    user_data = {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'provider': 'email'
    }
    token = create_session_token(user_data)
    
    # Set cookie
    response = jsonify({'ok': True, 'user': user_data})
    response = set_auth_cookie(response, token)
    
    return response

# Password hashing utilities
import bcrypt

def hash_password(password):
    """Hash password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password, password_hash):
    """Verify password against hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
```

### Frontend (JavaScript)

```javascript
// frontend/js/auth.js

/**
 * Login with email/password
 */
async function loginWithEmail(email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',  // Critical: sends/receives cookies
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }
        
        const data = await response.json();
        if (data.ok && data.user) {
            // Ensure 'sub' field
            const user = {
                ...data.user,
                sub: data.user.sub || data.user.id || data.user.email
            };
            
            // Cache session
            localStorage.setItem('auth:session', JSON.stringify({ user }));
            
            return user;
        }
        
        throw new Error('Invalid response');
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

/**
 * Signup with email/password
 */
async function signupWithEmail(email, password, confirmPassword, name) {
    try {
        const response = await fetch(`${API_BASE}/auth/createAccount`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                email,
                password,
                confirmPassword,
                name
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Signup failed');
        }
        
        const data = await response.json();
        if (data.ok && data.user) {
            const user = {
                ...data.user,
                sub: data.user.sub || data.user.id || data.user.email
            };
            
            localStorage.setItem('auth:session', JSON.stringify({ user }));
            return user;
        }
        
        throw new Error('Invalid response');
    } catch (error) {
        console.error('Signup error:', error);
        throw error;
    }
}

/**
 * Logout
 */
async function logout() {
    // Clear cache
    localStorage.removeItem('auth:session');
    
    // Call backend logout
    await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
    });
    
    // Redirect to login
    window.location.href = '/login';
}
```

### HTML Form Example

```html
<!-- frontend/login.html -->
<form id="loginForm">
    <input type="email" id="email" required placeholder="Email">
    <input type="password" id="password" required placeholder="Password">
    <button type="submit">Login</button>
    <div id="error" class="error" style="display: none;"></div>
</form>

<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error');
    
    try {
        const user = await loginWithEmail(email, password);
        if (user) {
            window.location.href = '/dashboard';
        }
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
});
</script>
```

## 4. Protected Routes/Pages

### Backend (Flask)

```python
# backend/api/protected.py

from backend.api.auth import require_auth

@auth_bp.route('/api/protected-route', methods=['GET'])
@require_auth
def protected_route():
    """Example protected route"""
    # request.user is available here (set by require_auth decorator)
    user_id = request.user['sub']
    return jsonify({'ok': True, 'data': f'Protected data for user {user_id}'})
```

### Frontend (JavaScript)

```javascript
// frontend/js/router.js

/**
 * Protect routes that require authentication
 */
async function protectRoute(routeHandler) {
    const user = await getCurrentUser();
    
    if (!user) {
        // Not authenticated, redirect to login
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
        return;
    }
    
    // User is authenticated, proceed with route
    routeHandler(user);
}

/**
 * Example: Protected dashboard page
 */
async function loadDashboard() {
    await protectRoute(async (user) => {
        // Load dashboard content
        const response = await fetch('/api/dashboard', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Session expired, redirect to login
                localStorage.removeItem('auth:session');
                window.location.href = '/login';
                return;
            }
            throw new Error('Failed to load dashboard');
        }
        
        const data = await response.json();
        renderDashboard(data);
    });
}

/**
 * Check auth status on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    
    if (user) {
        // User is logged in
        showAuthenticatedUI(user);
    } else {
        // User is not logged in
        showUnauthenticatedUI();
    }
});
```

## 5. State Management

### Frontend (JavaScript)

**Store user in localStorage, verify with backend:**

```javascript
// frontend/js/auth-state.js

class AuthState {
    constructor() {
        this.user = null;
        this.listeners = [];
    }
    
    /**
     * Initialize auth state
     */
    async init() {
        this.user = await getCurrentUser();
        this.notifyListeners();
        return this.user;
    }
    
    /**
     * Subscribe to auth state changes
     */
    subscribe(callback) {
        this.listeners.push(callback);
        // Immediately call with current state
        callback(this.user);
        
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }
    
    /**
     * Notify all listeners of state change
     */
    notifyListeners() {
        this.listeners.forEach(callback => callback(this.user));
    }
    
    /**
     * Set user (after login/signup)
     */
    setUser(user) {
        this.user = user;
        localStorage.setItem('auth:session', JSON.stringify({ user }));
        this.notifyListeners();
    }
    
    /**
     * Clear user (after logout)
     */
    clearUser() {
        this.user = null;
        localStorage.removeItem('auth:session');
        this.notifyListeners();
    }
    
    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return this.user !== null;
    }
}

// Singleton instance
const authState = new AuthState();

// Initialize on page load
authState.init();

// Example usage in components
authState.subscribe((user) => {
    if (user) {
        document.getElementById('userName').textContent = user.name;
        document.getElementById('logoutBtn').style.display = 'block';
    } else {
        document.getElementById('userName').textContent = 'Guest';
        document.getElementById('logoutBtn').style.display = 'none';
    }
});
```

### Handling Token Expiration

```javascript
// frontend/js/auth.js

/**
 * Check token expiration and refresh if needed
 */
async function checkTokenExpiration() {
    const user = await getCurrentUser();
    if (!user) return;
    
    // Check if token is close to expiring (within 1 day)
    // Backend will handle actual expiration, but we can preemptively refresh
    
    try {
        const response = await fetch(`${API_BASE}/me`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            // Token expired or invalid
            if (response.status === 401) {
                localStorage.removeItem('auth:session');
                window.location.href = '/login?expired=true';
            }
        }
    } catch (error) {
        console.error('Token check failed:', error);
    }
}

// Check token expiration every hour
setInterval(checkTokenExpiration, 60 * 60 * 1000);
```

## 6. Security Best Practices

### Backend Security

```python
# backend/api/auth.py

# 1. Rate limiting
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@auth_bp.route('/api/auth/login', methods=['POST'])
@limiter.limit("5 per minute")  # Limit login attempts
def login():
    # ... login code

# 2. CSRF protection (for forms)
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)

# 3. Password requirements
def validate_password(password):
    """Validate password strength"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    return True, None

# 4. Secure cookie settings
def set_auth_cookie(response, token):
    response.set_cookie(
        COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,  # Prevents XSS
        samesite='Lax',  # CSRF protection
        secure=os.getenv('FLASK_ENV') == 'production',  # HTTPS only
        path='/'
    )
    return response

# 5. Input validation
from marshmallow import Schema, fields, validate

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8))

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    schema = LoginSchema()
    errors = schema.validate(request.json)
    if errors:
        return jsonify({'ok': False, 'errors': errors}), 400
    # ... rest of login code
```

### Frontend Security

```javascript
// frontend/js/security.js

// 1. Sanitize user input
function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

// 2. Validate email format
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// 3. Never store sensitive data in localStorage
// Only store: user ID, email, name (non-sensitive data)
// Never store: passwords, tokens, API keys

// 4. Use HTTPS in production
if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.warn('Application should use HTTPS in production');
}

// 5. Clear sensitive data on logout
function logout() {
    // Clear all auth-related data
    localStorage.removeItem('auth:session');
    localStorage.removeItem('user_data');
    // ... clear other sensitive data
    
    // Call backend logout
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
    });
    
    window.location.href = '/login';
}
```

## 7. Desktop App Considerations (pywebview)

### Cookie Handling

```python
# desktop_app.py
import webview

# pywebview handles cookies automatically, but you may need to configure:

def create_window():
    window = webview.create_window(
        'CleanHouse',
        'http://localhost:5000',  # Your Flask app
        width=1200,
        height=800,
        # Cookies are handled automatically
        # But you may need to set cookie domain
    )
    
    # Enable cookies and localStorage
    # These are enabled by default in pywebview
    
    return window

if __name__ == '__main__':
    webview.start(create_window, debug=True)
```

### Handling OAuth Redirects

```python
# For OAuth, you may need to handle redirects differently in desktop app

@auth_bp.route('/api/auth/<provider>/callback', methods=['GET'])
def oauth_callback(provider):
    # ... OAuth handling code ...
    
    # Check if this is a desktop app request
    user_agent = request.headers.get('User-Agent', '')
    is_desktop = 'pywebview' in user_agent.lower()
    
    if is_desktop:
        # For desktop app, redirect to a special page that closes OAuth window
        response = make_response(redirect(f'{FRONTEND_URL}/oauth-success'))
        response = set_auth_cookie(response, token)
        return response
    else:
        # For web, normal redirect
        response = make_response(redirect(f'{FRONTEND_URL}/'))
        response = set_auth_cookie(response, token)
        return response
```

## Summary

**Key Points:**

1. **Session Management**: JWT tokens in HTTP-only cookies (30-day expiration)
2. **Frontend State**: localStorage cache + `/api/me` verification endpoint
3. **OAuth Flow**: Server-side redirect → callback → set cookie → redirect home
4. **Protected Routes**: `@require_auth` decorator on backend, `protectRoute()` on frontend
5. **Security**: HTTP-only cookies, SameSite protection, rate limiting, password hashing
6. **Desktop App**: pywebview handles cookies automatically, but may need special OAuth handling

**File Structure:**
```
backend/
  api/
    auth.py          # Auth routes and utilities
    protected.py     # Protected routes example
  models/
    user_model.py    # User database model
frontend/
  js/
    auth.js          # Auth functions
    auth-state.js    # Auth state management
    router.js        # Route protection
  login.html         # Login page
  dashboard.html     # Protected dashboard
```

This approach provides a secure, scalable authentication system that works well for both web and desktop applications.

