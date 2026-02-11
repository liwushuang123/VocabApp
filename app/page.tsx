"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">VocabApp</h1>
        {user && (
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        )}
      </div>

      <p className="text-gray-600">
        Learn vocabulary while reading English books and articles.
      </p>

      {!user ? (
        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full bg-green-600 text-white py-3 rounded-xl font-medium text-center hover:bg-green-700 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="block w-full bg-white text-gray-700 py-3 rounded-xl font-medium text-center border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Sign up
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/bookshelf"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-2">📚</div>
            <div className="font-medium">Bookshelf</div>
            <div className="text-sm text-gray-500 mt-1">Your books & articles</div>
          </Link>

          <Link
            href="/read"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-2">📖</div>
            <div className="font-medium">Read</div>
            <div className="text-sm text-gray-500 mt-1">Open PDF or article</div>
          </Link>

          <Link
            href="/vocab"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-2">📝</div>
            <div className="font-medium">Vocabulary</div>
            <div className="text-sm text-gray-500 mt-1">Saved words</div>
          </Link>

          <Link
            href="/vocab/review"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-2">🔄</div>
            <div className="font-medium">Review</div>
            <div className="text-sm text-gray-500 mt-1">Practice flashcards</div>
          </Link>
        </div>
      )}
    </div>
  );
}
