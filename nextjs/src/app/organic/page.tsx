import { buildPageMetadata } from "@/lib/seo";
import { themeComponents, themeConfig } from "@/lib/theme";

export const metadata = buildPageMetadata({
  title: "오가니카 쇼핑몰",
  description: `${themeConfig.site.name} 오가닉 쇼핑몰 경험.`,
  path: "/shop",
  noindex: true,
});

function MissingOrganicPage() {
  return (
    <div className="site-container px-4 py-16">
      <div className="surface-panel p-8">
        <h1 className="page-hero-title">Organic shop page</h1>
        <p className="page-hero-desc">
          The active theme does not define an OrganicPage slot yet.
        </p>
      </div>
    </div>
  );
}

export default function OrganicPage() {
  const Page = themeComponents.OrganicPage;
  return Page ? <Page config={themeConfig} /> : <MissingOrganicPage />;
}
