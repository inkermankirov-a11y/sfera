import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

export async function initDatabase() {
  const schema = `
create table if not exists users (
  id uuid primary key,
  yandex_id text not null unique,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_flows (
  state_hash text primary key,
  code_verifier text not null,
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sessions_expires_at_idx on sessions(expires_at);
create index if not exists auth_flows_expires_at_idx on auth_flows(expires_at);
`;
  await pool.query(schema);
}
