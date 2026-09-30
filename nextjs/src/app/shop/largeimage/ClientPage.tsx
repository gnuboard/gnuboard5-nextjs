"use client";

import Image from "next/image";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { api } from "@/lib/api";
import type { ShopProduct } from "@/lib/api";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { getClientPublicSettings } from "@/services/settings";
import type { BbsRewriteMode } from "@/lib/board-url";
import { ChevronLeft, ExternalLink, ImageIcon, X } from "lucide-react";

function clampImageNo(value: string | null): number {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, parsed));
}

export default function LargeImageClientPage() {
  const searchParams = useSearchParams();
  const itId = (searchParams.get("it_id") || "").trim();
  const imageNo = clampImageNo(searchParams.get("no"));
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(imageNo - 1);
  const [loading, setLoading] = useState(Boolean(itId));
  const [error, setError] = useState("");
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);

  useEffect(() => {
    setSelectedIndex(imageNo - 1);
  }, [imageNo]);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!itId) {
      setLoading(false);
      setProduct(null);
      setError("상품 번호가 없습니다.");
      applyClientPageMetadata({
        title: "상품 큰 이미지",
        description: "상품 이미지를 크게 확인하세요.",
        path: "/shop/largeimage",
      });
      return;
    }

    let alive = true;
    setLoading(true);
    setError("");

    api
      .get<ShopProduct>(`/shop/products/${encodeURIComponent(itId)}`)
      .then((response) => {
        if (!alive) return;
        const nextProduct = response.data as ShopProduct | undefined;
        if (!nextProduct?.it_id) {
          setProduct(null);
          setError("상품 정보를 찾을 수 없습니다.");
          return;
        }
        setProduct(nextProduct);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setProduct(null);
        setError(err instanceof Error ? err.message : "상품 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [itId]);

  const images = useMemo(
    () => (product?.images?.length ? product.images : [product?.image_url]).filter(Boolean) as string[],
    [product]
  );
  const safeIndex = images.length > 0 ? Math.min(selectedIndex, images.length - 1) : 0;
  const currentImage = images[safeIndex] || "";

  useEffect(() => {
    if (!product) return;
    applyClientPageMetadata({
      title: `${product.it_name} 큰 이미지`,
      description: `${product.it_name} 상품 이미지를 크게 확인하세요.`,
      path: `/shop/largeimage?it_id=${encodeURIComponent(itId)}&no=${safeIndex + 1}`,
    });
  }, [itId, product, safeIndex]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="space-y-4 rounded-[8px] border bg-card p-6">
          <div className="skeleton mb-4 h-6 w-48 rounded" />
          <div className="skeleton aspect-square w-full rounded-[8px]" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
        <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">상품 이미지를 표시할 수 없습니다.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error || "상품 정보를 찾을 수 없습니다."}</p>
        <Button className="mt-6" asChild>
          <Link href="/shop/products">상품 목록으로</Link>
        </Button>
      </div>
    );
  }

  const productHref = shopProductHref(product, productRewriteMode);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Breadcrumb
        items={[
          { label: "쇼핑", href: "/shop" },
          { label: product.it_name, href: productHref },
          { label: "큰 이미지" },
        ]}
      />

      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-sm text-muted-foreground">상품 이미지</p>
          <h1 className="text-2xl font-bold">{product.it_name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={productHref}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              상품으로
            </Link>
          </Button>
          {currentImage && (
            <Button variant="outline" size="sm" asChild>
              <a href={currentImage} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" />
                원본 열기
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" type="button" onClick={() => window.close()}>
            <X className="mr-1 h-4 w-4" />
            닫기
          </Button>
        </div>
      </div>

      <div className="rounded-[8px] border bg-card p-3">
        {currentImage ? (
          <div className="relative mx-auto aspect-square w-full max-w-[860px] overflow-hidden rounded-[8px] bg-muted">
            <Image
              src={currentImage}
              alt={`${product.it_name} 이미지 ${safeIndex + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 860px"
              className="object-contain"
              unoptimized={shouldBypassImageOptimization(currentImage)}
              priority
            />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
            등록된 이미지가 없습니다.
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative aspect-square overflow-hidden rounded-[6px] border bg-muted ${
                index === safeIndex ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
              aria-label={`${index + 1}번 이미지 보기`}
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
                unoptimized={shouldBypassImageOptimization(image)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
