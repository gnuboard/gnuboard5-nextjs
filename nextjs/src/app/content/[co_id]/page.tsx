// @g5-static-closed
import type { Metadata } from "next";
import { BreadcrumbJsonLd, ContentWebPageJsonLd } from "@/components/seo/JsonLd";
import { buildPageMetadata, plainTextSummary } from "@/lib/seo";
import { getContent, getContentBySeo, getContentList } from "@/services/content";
import ClientPage from "./ClientPage";

export const dynamicParams = false;
export const dynamic = "force-static";

function staticSegment(value: string | null | undefined): string {
  const segment = String(value || "").trim();
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    return "";
  }
  return segment;
}

export async function generateStaticParams() {
  const params = [{ co_id: "__g5_static__" }];
  const seen = new Set(params.map((item) => item.co_id));

  try {
    const contents = await getContentList(3600);

    for (const content of contents) {
      for (const segment of [
        staticSegment(content.co_id),
        staticSegment(content.co_seo_title),
      ]) {
        if (!segment || seen.has(segment)) continue;
        seen.add(segment);
        params.push({ co_id: segment });
      }
    }
  } catch {
    // Keep the placeholder route for static installs when the API is unavailable at build time.
  }

  return params;
}

interface PageProps {
  params: Promise<{ co_id: string }>;
}

async function resolveContentForPage(coId: string) {
  if (coId === "__g5_static__") return null;

  return (await getContent(coId).catch(() => null)) || getContentBySeo(coId).catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { co_id } = await params;
  const content = await resolveContentForPage(co_id);

  return buildPageMetadata({
    title: content?.co_subject || "Content",
    description: content ? plainTextSummary(content.co_content, content.co_subject) : undefined,
    path: content?.co_id ? `/content/${content.co_id}` : "/content",
    noindex: !content,
  });
}

export default async function Page({ params }: PageProps) {
  const { co_id } = await params;
  const initialContent = await resolveContentForPage(co_id);

  return (
    <>
      {initialContent ? (
        <>
          <ContentWebPageJsonLd content={initialContent} />
          <BreadcrumbJsonLd
            items={[
              {
                name: initialContent.co_subject,
                url: `/content/${encodeURIComponent(initialContent.co_id)}`,
              },
            ]}
          />
        </>
      ) : null}
      <ClientPage coId={co_id} initialContent={initialContent} />
    </>
  );
}
