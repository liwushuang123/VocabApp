import { createClient } from "@/lib/supabase/client";

export async function uploadPDF(
  file: File,
  userId: string,
  bookId: string
): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${bookId}.pdf`;

  const { error } = await supabase.storage.from("pdfs").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export async function getPDFSignedUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("pdfs")
    .createSignedUrl(path, 3600); // 1 hour expiry

  if (error) throw error;
  return data.signedUrl;
}

export async function deletePDF(path: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from("pdfs").remove([path]);

  if (error) throw error;
}
