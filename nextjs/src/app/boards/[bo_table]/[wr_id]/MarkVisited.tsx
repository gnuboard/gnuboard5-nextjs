"use client";

import { useEffect } from "react";
import { useVisitedPosts } from "@/hooks/useVisitedPosts";

export function MarkVisited({
  boTable,
  wrId,
}: {
  boTable: string;
  wrId: string;
}) {
  const { markVisited } = useVisitedPosts();

  useEffect(() => {
    markVisited(boTable, wrId);
  }, [boTable, wrId, markVisited]);

  return null;
}
