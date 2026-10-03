-- The model that wrote an AI Message (an OpenRouter id such as "vendor/name:free"), for debugging.
-- Null for User Messages, the Welcome Message and replies saved before it was recorded.
alter table public.messages
  add column model text check (char_length(model) between 1 and 200);
