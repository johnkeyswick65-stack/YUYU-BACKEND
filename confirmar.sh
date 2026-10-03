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
  echo "FALHOU login"
  exit 1
fi

echo "Token: ${#TOKEN} caracteres"
echo ""

CODIGO_ATIVO=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for b in d['bilhetes']:
    if b['estado'] == 'ativo':
        print(b['codigo'])
        break
")

echo "Codigo do bilhete ativo: $CODIGO_ATIVO"
echo ""
echo "=== Busca publica ==="
curl -s http://localhost:3000/api/bilhetes/$CODIGO_ATIVO | python3 -m json.tool
