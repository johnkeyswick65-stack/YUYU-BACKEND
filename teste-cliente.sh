#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

echo ""
echo "=== Login admin ==="
read -p "Password do admin: " SENHA
echo ""

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then
  echo "FALHOU login admin"
  exit 1
fi

echo "Token admin: ${#TOKEN} chars"
echo ""

echo "=== 1. Listar bilhetes existentes ==="
curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
if not d.get('bilhetes'):
    print('  (nenhum bilhete)')
else:
    for b in d['bilhetes']:
        n = b.get('comprador_nome') or '—'
        t = b.get('comprador_telefone') or '—'
        print(f\"  {b['codigo']} | nome: {n} | tel: {t}\")
"
echo ""

echo "=== 2. Criar bilhete com dados completos ==="
EVENTO_ID=$(curl -s http://localhost:3000/api/eventos | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['eventos'][0]['id'] if d['eventos'] else '')")

if [ -z "$EVENTO_ID" ]; then
  echo "  Sem eventos. Cria um primeiro no painel."
  exit 1
fi

NOVO=$(curl -s -X POST http://localhost:3000/api/bilhetes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"evento_id\":$EVENTO_ID,\"comprador_nome\":\"Joao Silva\",\"comprador_telefone\":\"841234567\",\"tipo\":\"vip\"}")

echo "$NOVO" | python3 -c "
import sys,json
d=json.load(sys.stdin)
b = d.get('bilhete', {})
print('  Código:', b.get('codigo'))
print('  Nome:', b.get('comprador_nome'))
print('  Telefone:', b.get('comprador_telefone'))
print()
print('  ATIVAR BILHETE')
"

NOVO_ID=$(echo "$NOVO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bilhete',{}).get('id',''))")

if [ -n "$NOVO_ID" ]; then
  curl -s -X PATCH http://localhost:3000/api/bilhetes/$NOVO_ID/estado \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"estado":"ativo"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  estado:', d.get('bilhete',{}).get('estado'))"
fi

echo ""
echo "=== 3. Testar login cliente (com o bilhete criado) ==="

CODIGO=$(echo "$NOVO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bilhete',{}).get('codigo',''))")

RESP=$(curl -s -X POST http://localhost:3000/api/cliente/login \
  -H "Content-Type: application/json" \
  -d "{\"codigo\":\"$CODIGO\",\"telefone\":\"841234567\",\"nome\":\"Joao Silva\"}")

echo "$RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('  ok:', d.get('ok'))
print('  nome:', d.get('nome'))
print('  telefone:', d.get('telefone'))
print('  token:', 'presente (' + str(len(d.get('token',''))) + ' chars)' if d.get('token') else 'AUSENTE')
print('  erro:', d.get('error') or '—')
"

echo ""
echo "=== 4. Testar login cliente com telefone errado ==="
curl -s -X POST http://localhost:3000/api/cliente/login \
  -H "Content-Type: application/json" \
  -d "{\"codigo\":\"$CODIGO\",\"telefone\":\"999999999\",\"nome\":\"Joao Silva\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  erro:', d.get('error'))"

echo ""
echo "=== 5. Testar login cliente com nome errado ==="
curl -s -X POST http://localhost:3000/api/cliente/login \
  -H "Content-Type: application/json" \
  -d "{\"codigo\":\"$CODIGO\",\"telefone\":\"841234567\",\"nome\":\"Outro Nome\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  erro:', d.get('error'))"

echo ""
echo "=== FIM ==="
echo ""
echo "Usa estes dados no browser em meus-bilhetes.html:"
echo "  Código: $CODIGO"
echo "  Telefone: 841234567"
echo "  Nome: Joao Silva"
