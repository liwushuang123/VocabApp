"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getBook } from "@/lib/services/books";
import { getPDFSignedUrl } from "@/lib/services/storage";

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-screen"
      style={{ backgroundColor: "var(--reading-bg)" }}
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
    </div>
  ),
});

export default function ReadBookPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [initialPage, setInitialPage] = useState(1);
  const [title, setTitle] = useState("");

  useEffect(() => {
    loadBook();
  }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBook = async () => {
    try {
      const book = await getBook(bookId);
      if (!book) {
        router.push("/bookshelf");
        return;
      }

      const url = await getPDFSignedUrl(book.pdf_storage_path);
      setFileUrl(url);
      setInitialPage(book.current_page || 1);
      setTitle(book.title);
    } catch (error) {
      console.error("Failed to load book:", error);
      router.push("/bookshelf");
    }
  };

  if (!fileUrl) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: "var(--reading-bg)" }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <PdfViewer
      fileUrl={fileUrl}
      bookId={bookId}
      bookTitle={title}
      initialPage={initialPage}
      onClose={() => router.push("/bookshelf")}
    />
  );
}
