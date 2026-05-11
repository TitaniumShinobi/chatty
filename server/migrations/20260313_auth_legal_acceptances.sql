-- Quantum/Chatty auth gateway migration
-- Adds credential-auth columns on users and legal acceptance evidence table.

create extension if not exists pgcrypto;

alter table if exists public.users
  add column if not exists display_name text,
  add column if not exists auth_provider text not null default 'oauth',
  add column if not exists auth_password_hash text,
  add column if not exists auth_last_login_at timestamptz,
  add column if not exists auth_created_at timestamptz default now(),
  add column if not exists auth_updated_at timestamptz default now();

create table if not exists public.auth_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  product text not null,
  doc_type text not null,
  doc_key text not null,
  doc_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'chatty-auth-register',
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists auth_legal_acceptances_user_idx
  on public.auth_legal_acceptances (user_id);

create index if not exists auth_legal_acceptances_email_idx
  on public.auth_legal_acceptances (lower(email));

create index if not exists auth_legal_acceptances_doc_idx
  on public.auth_legal_acceptances (doc_key, doc_version);

create unique index if not exists auth_legal_acceptances_identity_doc_version_idx
  on public.auth_legal_acceptances ((coalesce(user_id::text, lower(email))), doc_key, doc_version);
