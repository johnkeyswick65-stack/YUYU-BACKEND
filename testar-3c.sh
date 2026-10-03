#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password: " SENHA
echo ""

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

unset SENHA

CODIGO=$(curl -s http://localhost:3000/api/bilhetes -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['bilhetes'][0]['codigo'] if d['bilhetes'] else '')")

if [ -z "$CODIGO" ]; then
  echo "Sem bilhetes."
  exit 1
fi

echo "Codigo: $CODIGO"
echo ""

mkdir -p ~/testes-bilhetes

curl -s http://localhost:3000/api/bilhetes/$CODIGO/pdf -o ~/testes-bilhetes/bilhete.pdf
ls -la ~/testes-bilhetes/bilhete.pdf

# Verifica se é PDF válido
head -c 4 ~/testes-bilhetes/bilhete.pdf
echo ""
echo ""
echo "Ficheiro: ~/testes-bilhetes/bilhete.pdf"
