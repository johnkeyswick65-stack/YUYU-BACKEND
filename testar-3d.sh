#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

SENHA=$(cat ~/.senha-temp 2>/dev/null | tr -d '\n\r')

if [ -z "$SENHA" ]; then
  echo "Ficheiro ~/.senha-temp vazio ou inexistente"
  exit 1
fi

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

if [ -z "$TOKEN" ]; then
  echo "FALHOU login. Verifica a password em ~/.senha-temp"
  exit 1
fi

echo "Token: ${#TOKEN} chars"
echo ""

# Pega um bilhete ativo
CODIGO=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for b in d['bilhetes']:
    if b['estado'] == 'ativo' and not b['usado_em']:
        print(b['codigo'])
        break
")

if [ -z "$CODIGO" ]; then
  echo "Sem bilhete ativo disponivel para testar."
  exit 1
fi

echo "Bilhete: $CODIGO"
echo ""

echo "=== TESTE 1: Validar (deve dar VERDE) ==="
curl -s -X POST http://localhost:3000/api/bilhetes/$CODIGO/validar \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('resultado:', d.get('resultado'), '| motivo:', d.get('motivo'), '| usado_em:', d.get('bilhete',{}).get('usado_em'))"
echo ""

echo "=== TESTE 2: Validar outra vez (deve dar VERMELHO) ==="
curl -s -X POST http://localhost:3000/api/bilhetes/$CODIGO/validar \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('resultado:', d.get('resultado'), '| motivo:', d.get('motivo'))"
echo ""

echo "=== TESTE 3: Codigo inexistente ==="
curl -s -X POST http://localhost:3000/api/bilhetes/YUYU-AAAAA-BBBBB/validar \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('resultado:', d.get('resultado'), '| motivo:', d.get('motivo'))"
echo ""

echo "=== TESTE 4: Sem token (deve dar 401) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:3000/api/bilhetes/$CODIGO/validar
echo ""

echo "=== TESTE 5: Historico de validacoes ==="
ID=$(curl -s http://localhost:3000/api/bilhetes/$CODIGO | python3 -c "import sys,json; print(json.load(sys.stdin)['bilhete']['id'])")
curl -s http://localhost:3000/api/bilhetes/$ID/validacoes \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('total validacoes:', d.get('total')); [print(' -', v['resultado'], '|', v['notas'], '| admin:', v.get('admin_username')) for v in d.get('validacoes', [])]"
echo ""

echo "=== FIM ==="
