#!/bin/bash
MIGRATION_FILE="supabase/migrations/20251119004442_add_global_digest_settings_and_enhancements.sql"
psql "$DATABASE_URL" -f "$MIGRATION_FILE"
