import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const read = (path: string) => readFileSync(new URL(`../../..${path}`, import.meta.url), "utf8");
describe("battle rap PostgreSQL transactions", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table public.projects(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),name text,workspace_version integer default 1);
      create table public.project_members(project_id uuid references projects(id),user_id uuid references auth.users(id));
      create table public.project_wallets(id uuid primary key default gen_random_uuid(),project_id uuid unique references projects(id),points integer,updated_at timestamptz);
      create table public.project_transactions(id uuid primary key default gen_random_uuid(),project_id uuid,actor_user_id uuid,amount integer,type text,description text,status text,request_id uuid,ai_action text,metadata jsonb,created_at timestamptz default now());
      grant select on projects,project_members to authenticated;
    `);
    const chargeSql = read("/supabase/migrations/20260906121833_add_content_sets_and_video_jobs.sql");
    const start = chargeSql.indexOf("create or replace function public.atomic_deduct_project_points(");
    const end = chargeSql.indexOf("$$;", start) + 3;
    await db.exec(chargeSql.slice(start, end));
    await db.exec(read("/supabase/migrations/20260918034431_make_project_refund_idempotent.sql"));
    await db.exec(read("/supabase/migrations/20261017100759_free_battle_rap_pipeline.sql"));
    await db.exec(read("/supabase/migrations/20261017105212_battle_rap_stage_reviews.sql"));
  }, 30000);
  afterAll(async () => { await db?.close(); });
  it("charges, resumes, fences leases and refunds atomically using the real ledger functions", async () => {
    await db.exec("begin");
    try { await db.exec(read("/scripts/tests/battle-rap-transaction.sql")); }
    finally { await db.exec("rollback"); }
  });
  it("reviews use atomic revisions, preserve reservations and cannot skip gates", async () => {
    await db.exec("begin");
    try { await db.exec(read("/scripts/tests/battle-rap-review.sql")); }
    finally { await db.exec("rollback"); }
  });
  it("only exposes reads under RLS and denies anonymous access", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname,relrowsecurity from pg_class where relname in ('battle_rap_runs','battle_rap_steps','battle_rap_review_actions')");
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every(row => row.relrowsecurity)).toBe(true);
    const grants = await db.query<{ allowed: boolean }>("select has_table_privilege('anon','public.battle_rap_runs','SELECT') as allowed");
    expect(grants.rows[0].allowed).toBe(false);
  });
  it("a signed-in user cannot read another channel's battle", async () => {
    await db.exec("begin");
    try {
      await db.exec(`
        insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','owner@example.invalid'),('10000000-0000-4000-8000-000000000002','stranger@example.invalid');
        insert into projects(id,user_id,name) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private');
        insert into battle_rap_runs(id,project_id,created_by,workspace_version,input,budget_points) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'{}',100);
        set local role authenticated;
        select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
      `);
      expect((await db.query("select id from battle_rap_runs")).rows).toHaveLength(0);
      await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true)");
      expect((await db.query("select id from battle_rap_runs")).rows).toHaveLength(1);
    } finally { await db.exec("rollback"); }
  });
});
