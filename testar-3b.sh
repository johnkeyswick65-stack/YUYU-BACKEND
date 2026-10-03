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
  echo "Sem bilhetes. Cria um primeiro."
  exit 1
fi

echo "Codigo: $CODIGO"
echo ""

mkdir -p ~/testes-bilhetes

echo "=== QR PNG ==="
curl -s http://localhost:3000/api/bilhetes/$CODIGO/qr -o ~/testes-bilhetes/qr.png
file ~/testes-bilhetes/qr.png
ls -la ~/testes-bilhetes/qr.png
echo ""

echo "=== Barcode PNG ==="
curl -s http://localhost:3000/api/bilhetes/$CODIGO/barcode -o ~/testes-bilhetes/barcode.png
file ~/testes-bilhetes/barcode.png
ls -la ~/testes-bilhetes/barcode.png
echo ""

echo "Ficheiros em ~/testes-bilhetes/"
ls -la ~/testes-bilhetes/
