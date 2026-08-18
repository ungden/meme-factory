-- Seed the expression taxonomy and the three layout groups.
-- Re-runnable: every insert is idempotent.

insert into public.expression_tags (slug, label_vi, vibe_group, sort_order) values
  -- The 15 legacy character_poses.emotion values keep working after backfill.
  ('neutral',      'Bình thường',     'neutral',  10),
  ('happy',        'Vui',             'positive', 20),
  ('laughing',     'Cười lớn',        'positive', 30),
  ('excited',      'Hào hứng',        'positive', 40),
  ('love',         'Thả tim',         'positive', 50),
  ('cool',         'Ngầu',            'playful',  60),
  ('thinking',     'Đang nghĩ',       'neutral',  70),
  ('confused',     'Khó hiểu',        'neutral',  80),
  ('surprised',    'Bất ngờ',         'intense',  90),
  ('scared',       'Sợ',              'intense',  100),
  ('angry',        'Giận',            'negative', 110),
  ('sad',          'Buồn',            'negative', 120),
  ('crying',       'Khóc',            'negative', 130),
  ('tired',        'Mệt',             'negative', 140),
  ('custom',       'Tuỳ chỉnh',       'neutral',  900),
  -- Reaction vocabulary the meme editor actually needs.
  ('side_eye',     'Liếc xéo',        'playful',  150),
  ('skeptical',    'Nghi ngờ',        'playful',  160),
  ('smug',         'Tự đắc',          'playful',  170),
  ('gossip',       'Hóng chuyện',     'playful',  180),
  ('awkward',      'Ngượng',          'neutral',  190),
  ('overthinking', 'Nghĩ nhiều',      'neutral',  200),
  ('dead_inside',  'Hết hồn hết vía', 'negative', 210),
  ('exhausted',    'Kiệt sức',        'negative', 220),
  ('panic',        'Hoảng',           'intense',  230),
  ('shocked',      'Sốc',             'intense',  240),
  ('savage',       'Gắt',             'intense',  250),
  ('chill',        'Chill',           'positive', 260),
  ('proud',        'Tự hào',          'positive', 270),
  ('bored',        'Chán',            'neutral',  280),
  ('sarcastic',    'Mỉa mai',         'playful',  290)
on conflict (slug) do nothing;

-- Safe zones are normalized 0..1 against the canvas box.
-- `avoid` marks where the mascot lives, so text placement never covers the face.
insert into public.layout_presets
  (id, label_vi, description, default_safe_zones, default_text_style, recommended_chars, sort_order)
values
  (
    'tight_closeup',
    'Cận mặt',
    'Mặt mascot chiếm gần hết khung. Hợp câu ngắn, phản ứng mạnh.',
    jsonb_build_object(
      'version', 1,
      '1:1',  jsonb_build_object(
        'zones', jsonb_build_object(
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.74, 'w', 0.90, 'h', 0.20),
          'top',    jsonb_build_object('x', 0.05, 'y', 0.04, 'w', 0.90, 'h', 0.15)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.10, 'y', 0.18, 'w', 0.80, 'h', 0.54)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.90, 'w', 0.27, 'h', 0.07)),
      '4:5',  jsonb_build_object(
        'zones', jsonb_build_object(
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.76, 'w', 0.90, 'h', 0.19),
          'top',    jsonb_build_object('x', 0.05, 'y', 0.04, 'w', 0.90, 'h', 0.14)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.10, 'y', 0.20, 'w', 0.80, 'h', 0.53)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.91, 'w', 0.27, 'h', 0.06)),
      '9:16', jsonb_build_object(
        'zones', jsonb_build_object(
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.78, 'w', 0.90, 'h', 0.16),
          'top',    jsonb_build_object('x', 0.05, 'y', 0.06, 'w', 0.90, 'h', 0.13)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.08, 'y', 0.24, 'w', 0.84, 'h', 0.50)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.93, 'w', 0.27, 'h', 0.05)),
      '16:9', jsonb_build_object(
        'zones', jsonb_build_object(
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.70, 'w', 0.90, 'h', 0.24),
          'top',    jsonb_build_object('x', 0.05, 'y', 0.05, 'w', 0.90, 'h', 0.18)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.28, 'y', 0.12, 'w', 0.44, 'h', 0.72)),
        'watermark', jsonb_build_object('x', 0.76, 'y', 0.87, 'w', 0.21, 'h', 0.09))
    ),
    jsonb_build_object(
      'fontFamily', 'inter', 'fontWeight', 800, 'fontSize', 0.075, 'lineHeight', 1.25,
      'align', 'center', 'verticalAlign', 'middle', 'color', '#FFFFFF',
      'strokeColor', '#000000', 'strokeWidth', 0.14, 'uppercase', true, 'letterSpacing', 0
    ),
    34,
    10
  ),
  (
    'medium_portrait',
    'Trung cảnh',
    'Thấy đầu và vai. Chừa dải trống phía trên cho caption một đến hai dòng.',
    jsonb_build_object(
      'version', 1,
      '1:1',  jsonb_build_object(
        'zones', jsonb_build_object(
          'top',    jsonb_build_object('x', 0.05, 'y', 0.05, 'w', 0.90, 'h', 0.24),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.79, 'w', 0.90, 'h', 0.16)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.14, 'y', 0.31, 'w', 0.72, 'h', 0.46)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.90, 'w', 0.27, 'h', 0.07)),
      '4:5',  jsonb_build_object(
        'zones', jsonb_build_object(
          'top',    jsonb_build_object('x', 0.05, 'y', 0.05, 'w', 0.90, 'h', 0.22),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.80, 'w', 0.90, 'h', 0.15)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.14, 'y', 0.29, 'w', 0.72, 'h', 0.49)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.91, 'w', 0.27, 'h', 0.06)),
      '9:16', jsonb_build_object(
        'zones', jsonb_build_object(
          'top',    jsonb_build_object('x', 0.05, 'y', 0.07, 'w', 0.90, 'h', 0.19),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.80, 'w', 0.90, 'h', 0.14)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.10, 'y', 0.28, 'w', 0.80, 'h', 0.50)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.93, 'w', 0.27, 'h', 0.05)),
      '16:9', jsonb_build_object(
        'zones', jsonb_build_object(
          'top',    jsonb_build_object('x', 0.05, 'y', 0.06, 'w', 0.90, 'h', 0.22),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.74, 'w', 0.90, 'h', 0.20)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.30, 'y', 0.30, 'w', 0.40, 'h', 0.55)),
        'watermark', jsonb_build_object('x', 0.76, 'y', 0.87, 'w', 0.21, 'h', 0.09))
    ),
    jsonb_build_object(
      'fontFamily', 'inter', 'fontWeight', 800, 'fontSize', 0.085, 'lineHeight', 1.25,
      'align', 'center', 'verticalAlign', 'middle', 'color', '#FFFFFF',
      'strokeColor', '#000000', 'strokeWidth', 0.12, 'uppercase', true, 'letterSpacing', 0
    ),
    46,
    20
  ),
  (
    'offset_composition',
    'Lệch một bên',
    'Mascot đứng lệch trái hoặc phải, chừa nguyên một mảng trống lớn cho câu quote dài.',
    jsonb_build_object(
      'version', 1,
      '1:1',  jsonb_build_object(
        'zones', jsonb_build_object(
          'side',   jsonb_build_object('x', 0.50, 'y', 0.14, 'w', 0.45, 'h', 0.56),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.80, 'w', 0.90, 'h', 0.15)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.02, 'y', 0.10, 'w', 0.46, 'h', 0.85)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.90, 'w', 0.27, 'h', 0.07)),
      '4:5',  jsonb_build_object(
        'zones', jsonb_build_object(
          'side',   jsonb_build_object('x', 0.50, 'y', 0.12, 'w', 0.45, 'h', 0.58),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.81, 'w', 0.90, 'h', 0.14)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.02, 'y', 0.10, 'w', 0.46, 'h', 0.86)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.91, 'w', 0.27, 'h', 0.06)),
      '9:16', jsonb_build_object(
        'zones', jsonb_build_object(
          'top',    jsonb_build_object('x', 0.05, 'y', 0.07, 'w', 0.90, 'h', 0.26),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.78, 'w', 0.90, 'h', 0.16)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.05, 'y', 0.35, 'w', 0.90, 'h', 0.41)),
        'watermark', jsonb_build_object('x', 0.70, 'y', 0.93, 'w', 0.27, 'h', 0.05)),
      '16:9', jsonb_build_object(
        'zones', jsonb_build_object(
          'side',   jsonb_build_object('x', 0.48, 'y', 0.12, 'w', 0.47, 'h', 0.70),
          'bottom', jsonb_build_object('x', 0.05, 'y', 0.82, 'w', 0.90, 'h', 0.13)),
        'avoid', jsonb_build_array(jsonb_build_object('x', 0.02, 'y', 0.08, 'w', 0.44, 'h', 0.88)),
        'watermark', jsonb_build_object('x', 0.76, 'y', 0.87, 'w', 0.21, 'h', 0.09))
    ),
    jsonb_build_object(
      'fontFamily', 'inter', 'fontWeight', 800, 'fontSize', 0.070, 'lineHeight', 1.3,
      'align', 'left', 'verticalAlign', 'middle', 'color', '#FFFFFF',
      'strokeColor', '#000000', 'strokeWidth', 0.10, 'uppercase', false, 'letterSpacing', 0
    ),
    72,
    30
  )
on conflict (id) do nothing;
