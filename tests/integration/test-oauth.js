// Test Google OAuth URL construction
const clientId = '633884797416-d8imb5942bqa6q0mgk9c1rcncvngnlko.apps.googleusercontent.com'
const redirectUri = 'http://localhost:5173/auth/callback'
const googleAuthUrl = `https://accounts.google.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email profile&state=google`

console.log('Google OAuth URL:')
console.log(googleAuthUrl)
console.log('\nURL Length:', googleAuthUrl.length)
console.log('Client ID present:', googleAuthUrl.includes(clientId))
console.log('Redirect URI present:', googleAuthUrl.includes(encodeURIComponent(redirectUri)))
