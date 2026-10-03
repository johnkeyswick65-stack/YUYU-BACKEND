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
  echo "FALHOU: sem token"
  exit 1
fi

echo "Token: ${#TOKEN} caracteres"
echo ""

# Pega o id do primeiro evento
EVENTO_ID=$(curl -s http://localhost:3000/api/eventos | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['eventos'][0]['id'] if d['eventos'] else '')")

if [ -z "$EVENTO_ID" ]; then
  echo "Sem eventos. Cria um primeiro."
  exit 1
fi

echo "Evento usado: id=$EVENTO_ID"
echo ""

echo "=== TESTE 1: Criar bilhete Normal ==="
curl -s -X POST http://localhost:3000/api/bilhetes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"evento_id\":$EVENTO_ID,\"comprador_nome\":\"Joao Teste\",\"comprador_telefone\":\"840000000\",\"tipo\":\"normal\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('bilhete',{}); print('ok:',d.get('ok'),'| id:',b.get('id'),'| tipo:',b.get('tipo'),'| preco:',b.get('preco'),'| estado:',b.get('estado'),'| codigo:',b.get('codigo'))"
echo ""

echo "=== TESTE 2: Criar bilhete VIP ==="
curl -s -X POST http://localhost:3000/api/bilhetes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"evento_id\":$EVENTO_ID,\"comprador_nome\":\"Maria VIP\",\"comprador_telefone\":\"841111111\",\"tipo\":\"vip\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('bilhete',{}); print('ok:',d.get('ok'),'| id:',b.get('id'),'| tipo:',b.get('tipo'),'| preco:',b.get('preco'))"
echo ""

echo "=== TESTE 3: Listar bilhetes ==="
curl -s http://localhost:3000/api/bilhetes \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('total:', d.get('total'))
for b in d.get('bilhetes', []):
    print('  id:', b['id'], '| tipo:', b['tipo'], '| estado:', b['estado'], '| preco:', b['preco'])
"
echo ""

# Descobre ids
BILHETE_NORMAL=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); bs=[b for b in d['bilhetes'] if b['tipo']=='normal']; print(bs[0]['id'] if bs else '')")
BILHETE_VIP=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); bs=[b for b in d['bilhetes'] if b['tipo']=='vip']; print(bs[0]['id'] if bs else '')")

echo "Normal id=$BILHETE_NORMAL | VIP id=$BILHETE_VIP"
echo ""

echo "=== TESTE 4: Ativar o bilhete Normal ==="
curl -s -X PATCH http://localhost:3000/api/bilhetes/$BILHETE_NORMAL/estado \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estado":"ativo"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('bilhete',{}); print('ok:',d.get('ok'),'| estado:',b.get('estado'))"
echo ""

echo "=== TESTE 5: Upgrade Normal -> VIP (deve funcionar) ==="
curl -s -X PATCH http://localhost:3000/api/bilhetes/$BILHETE_NORMAL/upgrade \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('bilhete',{}); print('ok:',d.get('ok'),'| msg:',d.get('message'),'| tipo:',b.get('tipo'),'| preco:',b.get('preco'))"
echo ""

echo "=== TESTE 6: Upgrade outra vez (deve FALHAR) ==="
curl -s -X PATCH http://localhost:3000/api/bilhetes/$BILHETE_NORMAL/upgrade \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:',d.get('ok'),'| error:',d.get('error'))"
echo ""

echo "=== TESTE 7: Upgrade num VIP (deve FALHAR) ==="
curl -s -X PATCH http://localhost:3000/api/bilhetes/$BILHETE_VIP/upgrade \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:',d.get('ok'),'| error:',d.get('error'))"
echo ""

echo "=== TESTE 8: Busca publica por codigo (bilhete ativo) ==="
CODIGO=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['bilhetes'][0]['codigo'])")
curl -s http://localhost:3000/api/bilhetes/$CODIGO \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:',d.get('ok'),'| valido:',d.get('valido'),'| evento:',d.get('bilhete',{}).get('evento_nome'))"
echo ""

echo "=== TESTE 9: Codigo inexistente ==="
curl -s http://localhost:3000/api/bilhetes/YUYU-AAAAA-BBBBB \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:',d.get('ok'),'| valido:',d.get('valido'),'| error:',d.get('error'))"
echo ""

echo "=== FIM ==="
