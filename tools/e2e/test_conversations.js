#!/usr/bin/env node
// Simple E2E test: register/login, POST /api/conversations, GET /api/conversations
const BASE = process.env.BASE || 'http://localhost:5000'
const fetch = global.fetch || require('node-fetch')

function parseSetCookie(res) {
  const sc = res.headers.get('set-cookie') || res.headers.get('Set-Cookie')
  return sc ? sc.split(';')[0] : null
}

async function registerOrLogin(email, password, name) {
  // Try register first
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  })

  if (reg.ok) return parseSetCookie(reg)

  // If register failed because user exists, login
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  if (login.ok) return parseSetCookie(login)
  throw new Error('Auth failed')
}

async function run() {
  try {
    const email = `e2e+${Date.now()}@example.com`
    const password = 'e2e-pass'
    const name = 'E2E Test'

    console.log('Registering/logging in user:', email)
    const cookie = await registerOrLogin(email, password, name)
    if (!cookie) throw new Error('No cookie returned from auth')
    console.log('Received cookie:', cookie)

    // Create conversation payload
    const convo = [{ id: `conv-${Date.now()}`, title: 'E2E Conversation', messages: [{ id: 'm1', role: 'user', text: 'hello' }] }]

    // Save conversations
    let r = await fetch(`${BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ conversations: convo })
    })
    if (!r.ok) {
      console.error('POST /api/conversations failed', await r.text())
      process.exit(2)
    }
    console.log('Saved conversations')

    // Load conversations
    r = await fetch(`${BASE}/api/conversations`, {
      method: 'GET',
      headers: { Cookie: cookie }
    })

    if (!r.ok) {
      console.error('GET /api/conversations failed', await r.text())
      process.exit(3)
    }

    const j = await r.json()
    if (!j.ok) throw new Error('Unexpected response: ' + JSON.stringify(j))

    const convs = j.conversations || []
    console.log('Loaded conversations count:', convs.length)
    if (convs.length === 0) {
      console.error('No conversations returned')
      process.exit(4)
    }

    console.log('E2E test passed')
    process.exit(0)
  } catch (err) {
    console.error('E2E test failed:', err)
    process.exit(1)
  }
}

run()
