#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

read -p "Password: " SENHA
echo ""

RESP=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zona-verde\",\"password\":\"$SENHA\"}")

TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "FALHOU. Resposta:"
  echo "$RESP" | head -c 200
  echo ""
  exit 1
fi

# Guarda num ficheiro local em vez de /tmp
echo "export TOKEN='$TOKEN'" > ~/.yuyu-token.sh
chmod 600 ~/.yuyu-token.sh

echo ""
echo "Token tem ${#TOKEN} caracteres"
echo ""
echo "Para usar: source ~/.yuyu-token.sh"
