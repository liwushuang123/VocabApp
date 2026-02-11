import { createClient } from "@/lib/supabase/client";

export interface Book {
  id: string;
  title: string;
  current_page: number;
  total_pages: number;
  last_read_at: string | null;
  pdf_storage_path: string;
  created_at: string;
}

export async function getAllBooks(): Promise<Book[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("last_read_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function getBook(id: string): Promise<Book | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createBook(book: {
  title: string;
  pdf_storage_path: string;
}): Promise<Book> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("books")
    .insert({
      user_id: user.id,
      title: book.title,
      pdf_storage_path: book.pdf_storage_path,
      current_page: 1,
      total_pages: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateReadingProgress(
  id: string,
  currentPage: number
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("books")
    .update({
      current_page: currentPage,
      last_read_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteBook(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) throw error;
}
