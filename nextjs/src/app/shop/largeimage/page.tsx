import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import LargeImageClientPage from "./ClientPage";
import ProductsLoading from "../products/(list)/loading";

export const metadata = buildPageMetadata({
  title: "상품 큰 이미지",
  description: "상품 이미지를 큰 화면으로 확인하세요.",
  path: "/shop/largeimage",
  noindex: true,
});

export default function LargeImagePage() {
  return (
    <Suspense fallback={<ProductsLoading />}>
      <LargeImageClientPage />
    </Suspense>
  );
}
