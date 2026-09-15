import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SmartChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

const WELCOME: SmartChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Oi! Me conte o lançamento em uma frase — pode escrever, falar ou enviar um print. Ex.: “salário de 7.000 todo dia 5” ou “gastei 45 no Uber ontem”.",
  created_at: new Date(0).toISOString(),
};

/** Conversa única do Adicionar Inteligente, salva na conta do usuário. */
export const useSmartChat = (userId: string, enabled: boolean) => {
  const [messages, setMessages] = useState<SmartChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("smart_chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data || []) as SmartChatMessage[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  const append = useCallback(
    async (role: SmartChatMessage["role"], content: string) => {
      const text = content.trim();
      if (!text) return;
      const optimistic: SmartChatMessage = {
        id: `local-${Math.random().toString(36).slice(2)}`,
        role,
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      const { data } = await supabase
        .from("smart_chat_messages")
        .insert({ user_id: userId, role, content: text })
        .select("id, role, content, created_at")
        .maybeSingle();
      if (data) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? (data as SmartChatMessage) : m)));
      }
    },
    [userId],
  );

  const clear = useCallback(async () => {
    setMessages([]);
    await supabase.from("smart_chat_messages").delete().eq("user_id", userId);
  }, [userId]);

  return { messages: messages.length ? messages : [WELCOME], loading, append, clear };
};
