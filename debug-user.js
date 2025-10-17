// DEBUG USER SESSION STRUCTURE
// Run this in your browser console to see what the user object actually contains

console.log('🔍 DEBUGGING USER SESSION STRUCTURE');
console.log('=====================================');

// Check localStorage auth session
console.log('\n📋 LOCALSTORAGE AUTH SESSION:');
const authSession = localStorage.getItem('auth:session');
if (authSession) {
  try {
    const parsed = JSON.parse(authSession);
    console.log('Raw auth session:', parsed);
    if (parsed.user) {
      console.log('User object:', parsed.user);
      console.log('User keys:', Object.keys(parsed.user));
      console.log('user.sub:', parsed.user.sub);
      console.log('user.id:', parsed.user.id);
      console.log('user.email:', parsed.user.email);
      console.log('user.name:', parsed.user.name);
    }
  } catch (e) {
    console.log('Parse error:', e);
  }
} else {
  console.log('No auth:session found');
}

// Check API response
console.log('\n🌐 API /api/me RESPONSE:');
fetch('/api/me', { credentials: 'include' })
  .then(r => r.json())
  .then(data => {
    console.log('API response:', data);
    if (data.ok && data.user) {
      console.log('API user object:', data.user);
      console.log('API user keys:', Object.keys(data.user));
      console.log('API user.sub:', data.user.sub);
      console.log('API user.id:', data.user.id);
      console.log('API user.email:', data.user.email);
      console.log('API user.name:', data.user.name);
    }
  })
  .catch(e => console.log('API error:', e));

// Check cookies
console.log('\n🍪 COOKIES:');
console.log('All cookies:', document.cookie);
const cookies = document.cookie.split(';');
cookies.forEach(cookie => {
  if (cookie.trim().startsWith('sid=')) {
    console.log('Session cookie found:', cookie.trim());
  }
});

console.log('\n✅ Run this and tell me what you see for user.sub and user.id');


