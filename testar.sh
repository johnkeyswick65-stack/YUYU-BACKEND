#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password do admin: " SENHA
echo ""

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then
  echo "FALHOU: nao consegui token"
  exit 1
fi

echo "Token: ${#TOKEN} caracteres"
echo ""
echo "=== /api/bilhetes ==="
curl -s http://localhost:3000/api/bilhetes \
  -H "Authorization: Bearer $TOKEN" | head -c 300
echo ""
echo ""
echo "=== /api/eventos ==="
curl -s http://localhost:3000/api/eventos | head -c 200
echo ""
