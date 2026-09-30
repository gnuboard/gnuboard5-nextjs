// @g5-static-fallback
import type { Metadata } from "next";
import { BreadcrumbJsonLd, ContentWebPageJsonLd } from "@/components/seo/JsonLd";
import { DEFAULT_CONTENT_LINKS } from "@/lib/content-links";
import { buildPageMetadata, plainTextSummary } from "@/lib/seo";
import { getContent, getContentBySeo } from "@/services/content";
import ClientPage from "@/app/content/[co_id]/ClientPage";

export const dynamicParams = true;
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

  for (const content of DEFAULT_CONTENT_LINKS) {
    const segment = staticSegment(content.co_id);
    if (!segment || seen.has(segment)) continue;
    seen.add(segment);
    params.push({ co_id: segment });
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
    title: content?.co_subject || "Shop Content",
    description: content ? plainTextSummary(content.co_content, content.co_subject) : undefined,
    path: content?.co_id ? `/shop/content/${content.co_id}` : "/shop/content",
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
          <ContentWebPageJsonLd content={initialContent} pathPrefix="/shop/content" />
          <BreadcrumbJsonLd
            items={[
              {
                name: initialContent.co_subject,
                url: `/shop/content/${encodeURIComponent(initialContent.co_id)}`,
              },
            ]}
          />
        </>
      ) : null}
      <ClientPage
        coId={co_id}
        initialContent={initialContent}
        pathPrefix="/shop/content"
        routePattern="/shop/content/:co_id"
        surface="shop"
      />
    </>
  );
}
