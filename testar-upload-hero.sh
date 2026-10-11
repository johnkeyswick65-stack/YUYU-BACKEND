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

# Usar uma imagem pequena que já existe
IMG="$HOME/YUYU-EVENTOS/imagens/evento-demo.jpg"

if [ ! -f "$IMG" ]; then
  echo "Imagem de teste nao encontrada: $IMG"
  exit 1
fi

echo "A enviar $IMG..."
echo ""

curl -s -X POST https://yuyu-backend-1b4x.onrender.com/api/admin/hero/imagem \
  -H "Authorization: Bearer $TOKEN" \
  -F "imagem=@$IMG" | python3 -m json.tool
