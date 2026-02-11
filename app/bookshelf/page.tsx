"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  getAllBooks,
  createBook,
  deleteBook as deleteBookDB,
} from "@/lib/services/books";
import { uploadPDF, deletePDF } from "@/lib/services/storage";
import type { Book } from "@/lib/services/books";

export default function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const data = await getAllBooks();
      setBooks(data);
    } catch (error) {
      console.error("Failed to load books:", error);
    }
    setLoading(false);
  };

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
      setBooks((prev) => [newBook, ...prev]);
    } catch (error) {
      console.error("Failed to upload PDF:", error);
      alert("Failed to upload PDF. Please try again.");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (book: Book) => {
    try {
      await deletePDF(book.pdf_storage_path);
      await deleteBookDB(book.id);
      setBooks(books.filter((b) => b.id !== book.id));
    } catch (error) {
      console.error("Failed to delete book:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookshelf</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Add PDF"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {books.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">📚</div>
          <p>No books yet</p>
          <p className="text-sm mt-1">Tap &quot;+ Add PDF&quot; to upload a book</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {books.map((book) => (
            <div key={book.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <Link href={`/read/${book.id}`} className="block p-4">
                <div className="text-4xl mb-2 text-center">📄</div>
                <div className="font-medium text-sm truncate">{book.title}</div>
                {book.current_page > 1 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Page {book.current_page}
                  </div>
                )}
              </Link>
              <button
                onClick={() => handleDelete(book)}
                className="w-full text-xs text-red-400 py-2 border-t border-gray-100 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
