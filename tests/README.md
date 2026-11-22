Browser tests (Chromium from npm). They run against the REAL Django backend + the production build, no mocks.
  npm i puppeteer-core @sparticuz/chromium
  # build the frontend with VITE_API_URL=http://127.0.0.1:8000/api, then:
  ./run_real.sh t_home.mjs      # also t_feed, t_profile, t_sug, t_library, t_auth, t_notif
run_real.sh seeds a throw-away sqlite database (seed_real.py) and starts Django on :8000 and the build on :4173.
Paths inside the scripts point at /home/claude/...; adjust them for your machine.
Backend tests: cd backend && python manage.py test        (132 tests)
Translations:  cd frontend && node scripts/check-i18n.mjs
