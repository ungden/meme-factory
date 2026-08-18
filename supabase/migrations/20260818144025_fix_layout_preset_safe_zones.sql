-- Correct the seeded safe zones.
--
-- Invariant: no text zone may overlap an `avoid` rect. `avoid` marks the part of the
-- artwork that must stay uncovered (the face and its immediate surroundings), not the
-- mascot's whole silhouette — meme captions are expected to sit over the image.
--
-- Verify with:
--   with expanded as (
--     select lp.id, ratio.key aspect, z.key zone,
--       (z.value->>'x')::numeric zx, (z.value->>'y')::numeric zy,
--       (z.value->>'w')::numeric zw, (z.value->>'h')::numeric zh,
--       (a.value->>'x')::numeric ax, (a.value->>'y')::numeric ay,
--       (a.value->>'w')::numeric aw, (a.value->>'h')::numeric ah
--     from public.layout_presets lp
--     cross join lateral jsonb_each(lp.default_safe_zones) ratio
--     cross join lateral jsonb_each(ratio.value->'zones') z
--     cross join lateral jsonb_array_elements(ratio.value->'avoid') a
--     where ratio.key <> 'version')
--   select * from expanded
--   where zx < ax + aw and zx + zw > ax and zy < ay + ah and zy + zh > ay;
-- The result must be empty.

-- Close-up: the face fills the frame, so the avoid box is the face itself and the
-- caption bands sit above and below it.
update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{1:1,avoid}',
      jsonb_build_array(jsonb_build_object('x', 0.10, 'y', 0.20, 'w', 0.80, 'h', 0.52))
    )
where id = 'tight_closeup';

update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{16:9,avoid}',
      jsonb_build_array(jsonb_build_object('x', 0.28, 'y', 0.25, 'w', 0.44, 'h', 0.43))
    )
where id = 'tight_closeup';

update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{16:9,avoid}',
      jsonb_build_array(jsonb_build_object('x', 0.30, 'y', 0.30, 'w', 0.40, 'h', 0.42))
    )
where id = 'medium_portrait';

-- Offset: the mascot owns one column top to bottom, so every text zone — including
-- the lower one — belongs on the empty side rather than spanning the full width.
update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{1:1,zones,bottom}',
      jsonb_build_object('x', 0.50, 'y', 0.72, 'w', 0.45, 'h', 0.16)
    )
where id = 'offset_composition';

update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{4:5,zones,bottom}',
      jsonb_build_object('x', 0.50, 'y', 0.72, 'w', 0.45, 'h', 0.16)
    )
where id = 'offset_composition';

update public.layout_presets
set default_safe_zones = jsonb_set(
      default_safe_zones,
      '{16:9,zones,bottom}',
      jsonb_build_object('x', 0.48, 'y', 0.84, 'w', 0.47, 'h', 0.11)
    )
where id = 'offset_composition';

-- Refresh base images that never had their zones authored by hand.
update public.mascot_base_images mbi
set safe_zones = lp.default_safe_zones -> mbi.aspect_ratio
from public.layout_presets lp
where lp.id = mbi.layout_preset_id
  and mbi.safe_zones_source = 'layout_default'
  and lp.default_safe_zones ? mbi.aspect_ratio;
