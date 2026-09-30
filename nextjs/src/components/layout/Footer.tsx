import { G5Link as Link } from "@/components/ui/g5-link";

import { Separator } from "@/components/ui/separator";
import { DEFAULT_CONTENT_LINKS, contentHref } from "@/lib/content-links";
import { themeComponents, themeConfig } from "@/lib/theme";

const communityLinks = [
  { href: "/boards", label: "게시판" },
  { href: "/recent", label: "최신글" },
  { href: "/polls", label: "투표" },
  { href: "/faq", label: "FAQ" },
];

const shopLinks = [
  { href: "/shop", label: "쇼핑 홈" },
  { href: "/shop/products", label: "상품 목록" },
  { href: "/shop/reviews", label: "사용후기" },
  { href: "/shop/qas", label: "상품문의" },
  { href: "/shop/cart", label: "장바구니" },
  { href: "/shop/wishlist", label: "위시리스트" },
];

const infoLinks = [
  ...DEFAULT_CONTENT_LINKS.map((link) => ({
    href: contentHref(link.co_id),
    label: link.label,
    strong: link.strong,
  })),
  { href: "/register", label: "회원가입" },
];

function FooterLink({
  href,
  label,
  strong = false,
}: {
  href: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={strong ? "font-bold text-[#5f6368] hover:text-primary" : "text-[#5f6368] hover:text-primary"}
    >
      {label}
    </Link>
  );
}

function DefaultFooterBrand() {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-black text-primary">{themeConfig.site.name}</h3>
      <p className="text-[#5f6368]">{themeConfig.site.footerDescription}</p>
    </div>
  );
}

function DefaultFooterContact() {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-[#333333]">{themeConfig.site.customerCenterTitle}</h4>
      {themeConfig.site.customerCenterLines.map((line) => (
        <p key={line} className="text-[#5f6368]">
          {line}
        </p>
      ))}
    </div>
  );
}

function Footer() {
  const FooterBrand = themeComponents.FooterBrand;
  const FooterContact = themeComponents.FooterContact;

  return (
    <footer className="border-t border-[#e9ebee] bg-[#fafafa]">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
          {FooterBrand ? <FooterBrand config={themeConfig} /> : <DefaultFooterBrand />}

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-[#333333]">커뮤니티</h4>
            <nav className="grid gap-2">
              {communityLinks.map((link) => (
                <FooterLink key={link.href} {...link} />
              ))}
            </nav>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-[#333333]">쇼핑</h4>
            <nav className="grid gap-2">
              {shopLinks.map((link) => (
                <FooterLink key={link.href} {...link} />
              ))}
            </nav>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-[#333333]">안내</h4>
            <nav className="grid gap-2">
              {infoLinks.map((link) => (
                <FooterLink key={link.href} {...link} />
              ))}
            </nav>
          </div>

          {FooterContact ? <FooterContact config={themeConfig} /> : <DefaultFooterContact />}
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-[#6b7280] md:flex-row">
          <p>&copy; {new Date().getFullYear()} {themeConfig.site.copyrightName}. All rights reserved.</p>
          <p>Powered by Gnuboard5</p>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
export default Footer;
