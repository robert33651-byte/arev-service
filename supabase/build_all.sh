#!/bin/sh
# Собирает supabase/ALL.sql — один файл со всей базой. Запускать после изменения любого .sql.
cd "$(dirname "$0")"
{
  echo "-- Arev Service — ВСЯ база одним файлом. Собран автоматически из schema.sql и миграций ($(date +%Y-%m-%d))."
  echo "-- Supabase → SQL Editor → New query → вставить целиком → Run. Можно запускать повторно, данные не удаляются."
  echo "-- Порядок внутри: schema → tasks v2 → tasks geo → tasks v3 → admin name → talks → registry."
  for f in schema.sql migration_tasks_v2.sql migration_tasks_v2_geo.sql migration_tasks_v3.sql migration_admin_name.sql migration_talks.sql migration_registry.sql; do
    echo; echo "-- ==================================================================="; echo "-- >>> $f"; echo "-- ==================================================================="; cat "$f"
  done
} > ALL.sql
echo "ALL.sql: $(wc -l < ALL.sql) строк"
