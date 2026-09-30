import { SafeHtml, safeHtmlForPolicy } from "@/components/SafeHtml";

interface ProductDetailHtmlBlocksProps {
  headHtml?: string | null;
  tailHtml?: string | null;
}

export function ProductDetailHeadHtml({ headHtml }: Pick<ProductDetailHtmlBlocksProps, "headHtml">) {
  const html = safeHtmlForPolicy(headHtml, "commerce");
  if (!html) return null;

  return (
    <SafeHtml
      id="sit_hhtml"
      className="mb-6 prose max-w-none text-sm"
      html={headHtml}
      policy="commerce"
    />
  );
}

export function ProductDetailTailHtml({ tailHtml }: Pick<ProductDetailHtmlBlocksProps, "tailHtml">) {
  const html = safeHtmlForPolicy(tailHtml, "commerce");
  if (!html) return null;

  return (
    <SafeHtml
      className="mt-10 prose max-w-none text-sm"
      html={tailHtml}
      policy="commerce"
    />
  );
}
