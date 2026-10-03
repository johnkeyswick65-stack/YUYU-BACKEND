#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

echo ""
echo "=== Configurar DATABASE_URL (v2) ==="
echo ""
echo "IMPORTANTE: usa o EXTERNAL Database URL do Render"
echo "Deve conter: .oregon-postgres.render.com ou .frankfurt-postgres.render.com"
echo ""
read -p "Cola o External Database URL: " DB_URL

# Trim de espaços e aspas
DB_URL=$(echo "$DB_URL" | tr -d '\r\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | sed 's/^"//; s/"$//')

if [ -z "$DB_URL" ]; then
  echo "ERRO: vazio."
  exit 1
fi

echo ""
echo "Comprimento do que colaste: ${#DB_URL} caracteres"
echo "Começa por: $(echo "$DB_URL" | cut -c1-15)..."
echo "Contém render.com: $(echo "$DB_URL" | grep -c 'render.com')"

case "$DB_URL" in
  postgresql://*|postgres://*) ;;
  *)
    echo ""
    echo "ERRO: o URL tem de começar por postgresql:// ou postgres://"
    echo "O que colaste começa por: $(echo "$DB_URL" | cut -c1-20)"
    exit 1
    ;;
esac

# Remover linha antiga, gravar nova
sed -i '/^DATABASE_URL=/d' .env
echo "DATABASE_URL=$DB_URL" >> .env

echo ""
echo "=== Verificação ==="
LEN=$(awk -F= '/^DATABASE_URL=/{print length($2)}' .env)
echo "Guardado: $LEN caracteres"
[ "$LEN" -gt 80 ] && echo "OK ✓" || echo "AVISO: muito curto, verifica o URL"
