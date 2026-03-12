-- Fix RLS recursion between projects <-> project_members
-- Cause: projects SELECT policy reads project_members,
-- while project_members SELECT policy also read projects.

DROP POLICY IF EXISTS "Project members can view their memberships" ON public.project_members;

CREATE POLICY "Project members can view their memberships"
  ON public.project_members FOR SELECT
  USING (user_id = auth.uid());
