-- Backfill every legacy character pose as a base image.
--
-- No storage object is copied: storage_bucket records the bucket the file already
-- lives in. Rows land in 'draft' because legacy poses were generated without a
-- reserved caption area, so a human confirms the layout group before they become
-- usable templates.
--
-- A character routinely has several poses carrying the same emotion (126 of 135
-- legacy poses are 'neutral'), which collides with the
-- (character_id, expression_slug, layout_preset_id, aspect_ratio, variant_index)
-- unique key. variant_index exists for exactly that case, so it is assigned by
-- rank within the group, offset by whatever a previous run already inserted.

with mapped as (
  select
    cp.id,
    cp.character_id,
    cp.name,
    cp.image_url,
    cp.is_transparent,
    cp.created_at,
    case
      when exists (select 1 from public.expression_tags et where et.slug = cp.emotion)
        then cp.emotion
      else 'neutral'
    end as expression_slug
  from public.character_poses cp
  where not exists (
    select 1 from public.mascot_base_images m where m.legacy_pose_id = cp.id
  )
),
existing as (
  select character_id, expression_slug, count(*) as taken
  from public.mascot_base_images
  where layout_preset_id = 'medium_portrait' and aspect_ratio = '1:1'
  group by character_id, expression_slug
),
ranked as (
  select
    m.*,
    row_number() over (
      partition by m.character_id, m.expression_slug
      order by m.created_at, m.id
    ) - 1 + coalesce(e.taken, 0) as variant_index
  from mapped m
  left join existing e
    on e.character_id = m.character_id and e.expression_slug = m.expression_slug
)
insert into public.mascot_base_images (
  character_id, legacy_pose_id, expression_slug, expression_label,
  layout_preset_id, variant_index, image_url, storage_bucket, aspect_ratio,
  has_transparent_bg, safe_zones, safe_zones_source, default_text_style,
  recommended_chars, status, sort_order, created_at
)
select
  r.character_id,
  r.id,
  r.expression_slug,
  nullif(r.name, ''),
  'medium_portrait',
  r.variant_index,
  r.image_url,
  'character-poses',
  '1:1',
  coalesce(r.is_transparent, false),
  coalesce(lp.default_safe_zones -> '1:1', '{}'::jsonb),
  'layout_default',
  coalesce(lp.default_text_style, '{}'::jsonb),
  coalesce(lp.recommended_chars, 60),
  'draft',
  100,
  r.created_at
from ranked r
left join public.layout_presets lp on lp.id = 'medium_portrait'
on conflict (legacy_pose_id) do nothing;
