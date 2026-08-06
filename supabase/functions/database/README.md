# WABA Database Documentation

This folder contains all SQL scripts for setting up the WABA database on an external Supabase project.

## Setup Order

Run the scripts in the following order:

1. **`01-tables.sql`** — Creates all database tables
2. **`02-functions.sql`** — Creates database functions
3. **`03-triggers.sql`** — Creates triggers for automatic timestamp updates and user profile creation
4. **`04-rls-policies.sql`** — Enables Row Level Security and creates access policies
5. **`05-storage.sql`** — Creates storage buckets and policies
6. **`06-realtime.sql`** — Enables realtime for the messages table

## Prerequisites

- A Supabase project with authentication enabled
- Supabase CLI or access to the SQL Editor in the Supabase Dashboard

## Running the Scripts

### Option A: Supabase Dashboard
1. Go to your Supabase project → SQL Editor
2. Paste and run each file in order

### Option B: Supabase CLI
```bash
supabase db execute -f supabase/database/01-tables.sql
supabase db execute -f supabase/database/02-functions.sql
supabase db execute -f supabase/database/03-triggers.sql
supabase db execute -f supabase/database/04-rls-policies.sql
supabase db execute -f supabase/database/05-storage.sql
supabase db execute -f supabase/database/06-realtime.sql
```

## Notes

- All tables use `user_id` (UUID) to scope data per authenticated user
- RLS is enforced on all tables — users can only access their own data
- The `profiles` table is auto-populated via a trigger on `auth.users`
