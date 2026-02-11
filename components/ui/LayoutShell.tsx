"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Hide bottom nav on reading pages (e.g. /read/123) but show on /read index
  const isReading =
    pathname.startsWith("/read/") && pathname !== "/read/article" && pathname.split("/").length >= 3;

  return (
    <>
      <main className={isReading ? "" : "max-w-2xl mx-auto px-4 py-4"}>
        {children}
      </main>
      {!isReading && <BottomNav />}
    </>
  );
}
