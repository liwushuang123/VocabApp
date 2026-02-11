import { createClient } from "@/lib/supabase/client";

export interface VocabWord {
  id: string;
  word: string;
  translation: string;
  definition: string;
  example: string;
  audio_url: string | null;
  category: string;
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string;
  created_at: string;
}

export async function getAllWords(): Promise<VocabWord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getDueWords(): Promise<VocabWord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .lte("next_review_at", new Date().toISOString())
    .order("next_review_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createWord(word: {
  word: string;
  translation: string;
  definition: string;
  example: string;
  audio_url: string | null;
  category: string;
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string;
}): Promise<VocabWord> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("words")
    .insert({
      user_id: user.id,
      ...word,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Word already exists in your vocabulary");
    }
    throw error;
  }
  return data;
}

export async function updateWord(
  id: string,
  updates: Partial<Omit<VocabWord, "id" | "created_at">>
): Promise<VocabWord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("words")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWord(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("words").delete().eq("id", id);

  if (error) throw error;
}
