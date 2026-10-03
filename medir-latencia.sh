#!/data/data/com.termux/files/usr/bin/bash
cd ~/YUYU-BACKEND

echo "5 chamadas seguidas a /api/eventos:"
echo ""
for i in 1 2 3 4 5; do
  T=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:3000/api/eventos)
  C=$(curl -s -D - -o /dev/null http://localhost:3000/api/eventos 2>&1 | grep -i "x-cache" | tr -d '\r')
  printf "  Chamada %d: %ss | %s\n" "$i" "$T" "$C"
  sleep 1
done
