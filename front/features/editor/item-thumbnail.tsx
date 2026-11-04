"use client";

import { useEffect, useState } from "react";
import { getPostThumbnail } from "./post-thumbnail";

function PostThumbnail() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getPostThumbnail().then((next) => { if (active) setUrl(next); });
    return () => { active = false; };
  }, []);
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" className="icon-thumb" width={34} height={34} />;
  return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="icon-thumb">
        <ellipse cx="24" cy="37" rx="9" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M24 8v28M20 11h8M20 17h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="8" r="3" fill="currentColor" />
      </svg>
  );
}

export function ItemThumbnail({ kind }: { kind: "post" | "person" | "belt" | "area" }) {
  if (kind === "post") return <PostThumbnail />;
  if (kind === "person") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="icon-thumb">
        <circle cx="24" cy="10" r="5" fill="currentColor" />
        <path d="M24 17v17m-8-10 8-5 8 5m-8 10-6 9m6-9 6 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "belt") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="icon-thumb">
        <path d="M10 14v22M38 14v22M10 24h28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="10" cy="14" r="4" fill="currentColor" />
        <circle cx="38" cy="14" r="4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="icon-thumb">
      <path d="M8 10h31v27H8z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4 3" />
      <path d="M13 16h21v15H13z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
