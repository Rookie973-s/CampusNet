#!/bin/bash
# usage: run_real.sh test.mjs  -- real Django backend + built frontend, no mocks
cd /home/claude/server && rm -f db.sqlite3 && rm -rf media/questions private_media
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:4173" DEBUG=True LIBRARY_PRIVATE_ROOT=/tmp/cc_private_e2e
rm -rf /tmp/cc_private_e2e
python3 /home/claude/e2e2/seed_real.py > /tmp/seed.log 2>&1 || { cat /tmp/seed.log; exit 9; }
python3 manage.py runserver 127.0.0.1:8000 --noreload > /tmp/django.log 2>&1 &
D=$!
cd /home/claude/app && npx vite preview --port 4173 --strictPort --host 127.0.0.1 > /tmp/preview.log 2>&1 &
P=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:4173/ && curl -s -o /dev/null http://127.0.0.1:8000/api/departments/ && break; sleep 0.5; done
cd /home/claude/e2e2 && timeout 900 node "$1"; RC=$?
kill $D $P 2>/dev/null; wait 2>/dev/null; exit $RC
