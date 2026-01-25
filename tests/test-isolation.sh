#!/usr/bin/env bash
# Simple cookie-jar isolation test script
# Usage: ./test-isolation.sh
set -euo pipefail
BASE=http://localhost:5000
# 1) register or login user A
curl -c cookieA.txt -sS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"email":"isolation-a@example.com","password":"pass","name":"A Test"}' || true
# 2) post conversation as A
curl -b cookieA.txt -sS -X POST "$BASE/api/conversations" -H 'Content-Type: application/json' -d '{"conversations":[{"id":"test-a-1","messages":[{"role":"user","text":"hello from A"}]}]}'
# 3) register or login B
curl -c cookieB.txt -sS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"email":"isolation-b@example.com","password":"pass","name":"B Test"}' || true
# 4) get conversations as B (should not see A)
curl -b cookieB.txt -sS "$BASE/api/conversations" | jq .
