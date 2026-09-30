import { buildPageMetadata } from "@/lib/seo";
import { themeComponents, themeConfig } from "@/lib/theme";

export const metadata = buildPageMetadata({
  title: "커뮤니티",
  description: `${themeConfig.site.name} 커뮤니티 게시판 경험.`,
  path: "/community",
  noindex: true,
});

function MissingCommunityPage() {
  return (
    <div className="site-container px-4 py-16">
      <div className="surface-panel p-8">
        <h1 className="page-hero-title">Community page</h1>
        <p className="page-hero-desc">
          The active theme does not define a CommunityPage slot yet.
        </p>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const Page = themeComponents.CommunityPage;
  return Page ? <Page config={themeConfig} /> : <MissingCommunityPage />;
}
