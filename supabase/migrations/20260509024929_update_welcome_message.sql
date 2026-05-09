ALTER TABLE public.widget_settings
  ALTER COLUMN welcome_message SET DEFAULT 'Welcome! Tell us what you need help with today.';

UPDATE public.widget_settings
SET welcome_message = 'Welcome! Tell us what you need help with today.'
WHERE welcome_message IS NULL OR welcome_message = 'Hi! How can we help?';
