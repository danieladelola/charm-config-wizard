-- Add logisync.vip to allowed_domains for all widget settings (idempotent)
UPDATE public.widget_settings
SET allowed_domains = (
  SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(allowed_domains, ARRAY[]::text[]) || ARRAY['logisync.vip','tradeshorizons.vip']))
),
updated_at = now();
