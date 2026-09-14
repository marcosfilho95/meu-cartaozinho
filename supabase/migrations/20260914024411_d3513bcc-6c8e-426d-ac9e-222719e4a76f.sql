CREATE TABLE public.smart_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smart_chat_messages_user_created_idx ON public.smart_chat_messages (user_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_chat_messages TO authenticated;
GRANT ALL ON public.smart_chat_messages TO service_role;
ALTER TABLE public.smart_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own smart chat messages" ON public.smart_chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);