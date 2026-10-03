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

# Guarda na pasta Downloads do Android
DESTINO=~/storage/downloads/bilhete-$CODIGO.pdf

curl -s "http://localhost:3000/api/bilhetes/$CODIGO/pdf" -o "$DESTINO"

ls -la "$DESTINO"
echo ""
echo "Guardado em: $DESTINO"
echo ""
echo "Abre com: termux-open $DESTINO"
