#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password admin: " SENHA
echo ""

TOKEN=$(curl -s -X POST https://yuyu-backend-1b4x.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then
  echo "FALHOU login"
  exit 1
fi

echo "Token OK (${#TOKEN} chars)"
echo ""

echo "=== Resumo ==="
curl -s https://yuyu-backend-1b4x.onrender.com/api/admin/acessos/resumo \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('IPs activos (24h):', len(d.get('ips_activos',[])))
for ip in d.get('ips_activos',[])[:5]:
    print(' ', ip['ip'], '| total:', ip['total'], '| erros:', ip['erros'])
print('Bloqueados:', len(d.get('bloqueados',[])))
"
echo ""

echo "=== Ultimos 5 acessos ==="
curl -s "https://yuyu-backend-1b4x.onrender.com/api/admin/acessos?limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for a in d.get('acessos',[]):
    print(' ', a['ip'], '|', a['metodo'], a['rota'], '|', a['status'])
"
