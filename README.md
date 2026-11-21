# windracehub

Regatten in der Region Zürich: Ausschreibungen, Segelanweisungen, Mitteilungen, Resultate und Meldelisten an einem Ort.
Eine einfache Alternative zu manage2sail, gebaut für Organisatoren und Wettfahrtleitungen.

## Was es kann

- **Öffentlich:** Regattaliste (Suche, Club, Klasse, kommend/vergangen), Eventseite mit Dokumenten, Mitteilungen ("Neu"-Badge 48 h), Resultaten pro Klasse (provisorisch/final, frühere Stände), Meldeliste, Programm, Kalender-Export (.ics).
- **Organisator (Host):** Regatta mit einem Formular erstellen (nur Name + Datum Pflicht), alles auf einer Seite bearbeiten, für nächstes Jahr kopieren, veröffentlichen/verbergen/absagen, Team einladen (Link per E-Mail/WhatsApp).
- **Wettfahrtleitung (Official):** PDFs reinziehen → Art wird aus dem Dateinamen erraten → veröffentlichen. Resultate als Sailwave-HTML, CSV oder direkt aus Excel einfügen (Vorschau vor dem Veröffentlichen) oder als PDF.
- Der erste registrierte Benutzer wird Admin und sieht alle Regatten.

## Stack

Next.js 15 (App Router, Server Actions) · Prisma · Postgres (Supabase) · Supabase Storage für Dateien · Tailwind. Hosting: Vercel.

## Lokal starten

```bash
npm install
# Postgres lokal oder Supabase-URL in .env (siehe .env.example)
npx prisma migrate deploy
npm run seed        # 60 Zürcher Regatten 2026 aus manage2sail (Titel, Datum, Ort, Club, Link)
npm run dev
```

Ohne `SUPABASE_URL` landen Uploads im Ordner `uploads/` (nur für lokal).

## Live schalten (Vercel + Supabase)

1. **Supabase:** neues Projekt (Region Zürich/Frankfurt). Unter *Storage* einen **öffentlichen** Bucket `files` anlegen.
   Unter *Project settings → Database* die Connection-Strings kopieren (pooled 6543 → `DATABASE_URL` mit `?pgbouncer=true`, direct 5432 → `DIRECT_URL`).
   Unter *Project settings → API* `SUPABASE_URL` und `service_role`-Key kopieren.
2. **GitHub:** diesen Ordner in ein Repo pushen.
3. **Vercel:** Repo importieren, die Variablen aus `.env.example` setzen (`SESSION_SECRET` = `openssl rand -hex 32`, `APP_URL=https://windracehub.com`). Deploy führt die Migrationen automatisch aus.
4. Beim Deploy laufen Migrationen und der Import der Zürcher Regatten automatisch (mehrfach ausführen ist unschädlich).
5. Auf der Seite registrieren: der erste Account wird Admin.
6. Domain `windracehub.com` in Vercel unter *Domains* hinzufügen.

## Noch offen

- E-Mails (Einladungen, Passwort vergessen, "neue Mitteilung"-Benachrichtigung) – braucht einen Mail-Dienst (z.B. Resend).
- Excel (.xlsx) direkt hochladen (heute: kopieren & einfügen oder CSV).
- Details der importierten Regatten (Klassen, Dokumente, Resultate) sind nicht übernommen, nur die Liste.
- Ranglisten über mehrere Regatten (Cups/Serien wie ZLC), wie auf sunsetrace.
