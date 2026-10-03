#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

echo ""
echo "=== Configurar Cloudinary no .env ==="
echo ""

read -p "Cloud Name (ex: xtgn4smp): " CLOUD_NAME
read -p "API Key: " API_KEY
read -s -p "API Secret (não vai aparecer enquanto escreves): " API_SECRET
echo ""

if [ -z "$CLOUD_NAME" ] || [ -z "$API_KEY" ] || [ -z "$API_SECRET" ]; then
  echo "ERRO: algum valor ficou vazio. Nada foi alterado."
  exit 1
fi

# Remove linhas antigas (mesmo que estejam vazias)
sed -i '/^CLOUDINARY_CLOUD_NAME=/d' .env
sed -i '/^CLOUDINARY_API_KEY=/d' .env
sed -i '/^CLOUDINARY_API_SECRET=/d' .env

# Acrescenta as novas
{
  echo "CLOUDINARY_CLOUD_NAME=$CLOUD_NAME"
  echo "CLOUDINARY_API_KEY=$API_KEY"
  echo "CLOUDINARY_API_SECRET=$API_SECRET"
} >> .env

echo ""
echo "=== Gravado. Verificação ==="
echo "Cloud Name:  $(grep -c 'CLOUDINARY_CLOUD_NAME=.' .env)"
echo "API Key:     $(grep -c 'CLOUDINARY_API_KEY=.' .env)"
echo "API Secret:  $(grep -c 'CLOUDINARY_API_SECRET=.' .env)"
echo ""
echo "Esperado: 1 1 1"
