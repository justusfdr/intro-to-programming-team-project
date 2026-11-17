import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleView } from "@/components/library/ArticleView";
import { AppShell } from "@/components/shell/AppShell";
import { articleBySlug } from "@/lib/library/library";
import { pageDeps } from "@/lib/server/deps";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = articleBySlug((await params).slug);
  return { title: article?.title ?? "Library" };
}

// One article of the Focus library (spec 29). An address that names no article is "not found".
export default async function ArticlePage({ params }: Props) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const article = articleBySlug((await params).slug);
  if (!article) notFound();
  return (
    <AppShell current="/focus">
      <ArticleView article={article} />
    </AppShell>
  );
}
