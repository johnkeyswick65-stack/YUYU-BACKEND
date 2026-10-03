#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password: " SENHA
echo ""

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then
  echo "FALHOU: sem token"
  exit 1
fi

echo "Token: ${#TOKEN} caracteres"
echo ""

echo "=== 1ª chamada (sem cache) ==="
curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" \
  http://localhost:3000/api/admin/stats -H "Authorization: Bearer $TOKEN"

sleep 1

echo ""
echo "=== 2ª chamada (cache backend quente) ==="
curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" \
  http://localhost:3000/api/admin/stats -H "Authorization: Bearer $TOKEN"

sleep 16

echo ""
echo "=== 3ª chamada (cache expirado) ==="
curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" \
  http://localhost:3000/api/admin/stats -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== /api/auth/me ==="
curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" \
  http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
