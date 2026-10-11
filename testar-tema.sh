#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password admin: " SENHA
echo ""

TOKEN=$(curl -s -X POST https://yuyu-backend-1b4x.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then echo "FALHOU"; exit 1; fi

echo "Token OK"
echo ""
echo "=== Mudar para rosa ==="
curl -s -X PUT https://yuyu-backend-1b4x.onrender.com/api/admin/config/tema_ativo \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"valor":"rosa"}'
echo ""
echo ""
echo "=== Ler config ==="
curl -s https://yuyu-backend-1b4x.onrender.com/api/config-publica | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('tema_ativo:', d['config'].get('tema_ativo'))
"
