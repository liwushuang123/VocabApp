"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { createBook } from "@/lib/services/books";
import { uploadPDF } from "@/lib/services/storage";

export default function ReadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const bookId = crypto.randomUUID();
      const storagePath = await uploadPDF(file, user.id, bookId);
      const newBook = await createBook({
        title: file.name.replace(".pdf", ""),
        pdf_storage_path: storagePath,
      });

      router.push(`/read/${newBook.id}`);
    } catch (error) {
      console.error("Failed to upload PDF:", error);
      alert("Failed to upload PDF. Please try again.");
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Read</h1>

      <div className="space-y-3">
        {/* Upload PDF */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow disabled:opacity-50"
        >
          <div className="text-4xl mb-2">📄</div>
          <div className="font-medium">
            {uploading ? "Uploading..." : "Open PDF"}
          </div>
          <div className="text-sm text-gray-500 mt-1">Upload and read a PDF file</div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Paste article */}
        <Link
          href="/read/article"
          className="block w-full bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
        >
          <div className="text-4xl mb-2">📋</div>
          <div className="font-medium">Paste Article</div>
          <div className="text-sm text-gray-500 mt-1">Paste text to read and learn from</div>
        </Link>
      </div>
    </div>
  );
}
