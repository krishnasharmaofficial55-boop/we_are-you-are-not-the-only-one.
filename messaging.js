import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  conversationId: null,
  channel: null
};

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  state.user = data.user;
  return state.user;
}

export async function signUp(email, password, displayName = "") {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
  state.user = null;
}

export async function createConversation(otherUserId) {
  if (!state.user) await getCurrentUser();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({})
    .select()
    .single();

  if (error) throw error;

  const { error: memberError } = await supabase
    .from("conversation_members")
    .insert([
      { conversation_id: conversation.id, user_id: state.user.id },
      { conversation_id: conversation.id, user_id: otherUserId }
    ]);

  if (memberError) throw memberError;
  return conversation.id;
}

export async function loadMessages(conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function sendMessage(conversationId, body) {
  if (!state.user) await getCurrentUser();
  const clean = body.trim();
  if (!clean) return null;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: state.user.id,
      body: clean
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function subscribeToMessages(conversationId, onMessage) {
  if (state.channel) await supabase.removeChannel(state.channel);

  state.conversationId = conversationId;
  state.channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      },
      payload => onMessage(payload.new)
    )
    .subscribe();

  return state.channel;
}

export { supabase };
