"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { toG5ShortPath } from "@/lib/g5-short-url";
import { normalizeG5ImageSrc } from "@/lib/image";
import type { ShopBanner } from "@/lib/shop-types";
import { attachSwiperControls, usePrefersReducedMotion } from "./shop-swiper";

/** 자동 넘김 간격과 겹쳐 녹이는 시간. 레퍼런스 mainbanner.10.skin.php 의 Swiper 값과 같다. */
export const BANNER_INTERVAL_MS = 6500;
const BANNER_SPEED_MS = 900;

interface BannerCopy {
  eyebrow: string;
  title: string;
}

/**
 * 배너 폼의 "이미지 설명"(bn_alt)이 곧 글이다. `|` 앞은 눈썹글, 뒤는 제목.
 * "Autumn table | 한 그릇으로 차분해지는 저녁" → eyebrow/title. 없으면 전부 제목.
 */
export function splitBannerCopy(alt: string): BannerCopy {
  const text = alt.trim();
  const bar = text.indexOf("|");
  if (bar < 0) return { eyebrow: "", title: text };
  return { eyebrow: text.slice(0, bar).trim(), title: text.slice(bar + 1).trim() };
}

/** 배너 링크. 사이트 안 주소는 앱의 짧은 경로로, 바깥 주소는 그대로. */
export function bannerHref(banner: Pick<ShopBanner, "bn_url" | "hit_url">): { href: string; external: boolean } {
  const raw = (banner.bn_url || "").trim();
  if (!raw || raw === "http://" || raw === "#") return { href: "", external: false };
  if (raw.startsWith("/")) return { href: toG5ShortPath(raw), external: false };
  if (/^https?:\/\//i.test(raw)) return { href: banner.hit_url || raw, external: true };
  return { href: toG5ShortPath(`/${raw}`), external: false };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function BannerSlide({ banner, index, active, load }: { banner: ShopBanner; index: number; active: boolean; load: boolean }) {
  const { eyebrow, title } = splitBannerCopy(banner.bn_alt);
  const { href, external } = bannerHref(banner);
  const image = (
    <img
      className={`solune-banner-img${banner.bn_border ? " sbn_border" : ""}`}
      /* 겹쳐 녹이는(fade) 효과라 여섯 장이 한자리에 쌓여 loading="lazy" 가 듣지 않는다.
         첫 장만 바로 받고 나머지는 load 가 켜질 때(페이지를 다 받은 뒤 · 넘기기 직전) 채운다. */
      src={load ? normalizeG5ImageSrc(banner.image_url) : undefined}
      alt={banner.bn_alt}
      width={1920}
      height={920}
      fetchPriority={index === 0 ? "high" : undefined}
      decoding={index === 0 ? undefined : "async"}
      draggable={false}
    />
  );

  return (
    <>
      {!href ? (
        image
      ) : external ? (
        <a
          href={href}
          target={banner.bn_new_win ? "_blank" : undefined}
          rel={banner.bn_new_win ? "noopener noreferrer" : undefined}
          tabIndex={active ? 0 : -1}
        >
          {image}
        </a>
      ) : (
        <Link href={href} tabIndex={active ? 0 : -1}>
          {image}
        </Link>
      )}
      {eyebrow || title ? (
        /* 글은 화면 낭독기에는 내지 않는다 — 같은 값이 이미 이미지 alt 로 읽힌다.
           클릭도 통과시킨다(pointer-events:none) — 진짜 링크는 사진을 감싼 <a> 다. */
        <div className="solune-banner-caption" aria-hidden>
          <div className="solune-banner-caption-inner">
            {eyebrow ? <span className="solune-banner-eyebrow">{eyebrow}</span> : null}
            {title ? <strong className="solune-banner-title">{title}</strong> : null}
            {href ? (
              <span className="solune-banner-cta">
                자세히 보기
                <ArrowRight size={16} aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * 쇼핑 홈 첫 화면. 레퍼런스 mainbanner.10.skin.php 와 같은 Swiper 설정이다 — loop · fade(900ms) ·
 * 6.5초 자동 넘김(마우스를 올리면 멎음) · 키보드 · 막대 표시 · 좌우 단추.
 * 활성 막대는 자동 넘김이 얼마나 남았는지 --solune-banner-progress 로 채워 보인다.
 * 사진이 천천히 다가오는 켄 번즈와 글이 한 줄씩 떠오르는 것은 CSS 가 .swiper-slide-active 를 보고 한다.
 * 움직임을 줄여 달라고 한 사람에게는 겹쳐 녹이지도, 저절로 넘기지도 않는다.
 */
export function SoluneShopBanner({ banners }: { banners: ShopBanner[] }) {
  const count = banners.length;
  const multi = count > 1;
  const reduce = usePrefersReducedMotion();
  const swiperRef = useRef<SwiperInstance | null>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0, 1 % Math.max(count, 1)]));

  /* 페이지를 다 받은 뒤에는 나머지 사진도 모두 받아 둔다. */
  useEffect(() => {
    const loadAll = () => setLoaded(new Set(banners.map((_, slideIndex) => slideIndex)));
    if (document.readyState === "complete") loadAll();
    else window.addEventListener("load", loadAll, { once: true });
    return () => window.removeEventListener("load", loadAll);
  }, [banners]);

  const setProgress = useCallback((value: number) => {
    swiperRef.current?.el?.style.setProperty("--solune-banner-progress", String(Math.max(0, Math.min(1, value))));
  }, []);

  const togglePause = () => {
    const swiper = swiperRef.current;
    const next = !paused;
    setPaused(next);
    if (!swiper?.autoplay) return;
    if (next) swiper.autoplay.stop();
    else swiper.autoplay.start();
  };

  if (count === 0) return null;

  return (
    <div id="main_bn" className="solune-banner">
      <Swiper
        /* 움직임 줄임이 바뀌면 효과 · 자동 넘김이 달라지므로 새로 세운다. */
        key={reduce ? "reduced" : "motion"}
        className={`solune-banner-swiper${multi ? " is-multi" : ""}${paused ? " is-paused" : ""}`}
        style={{ "--solune-banner-progress": reduce ? "1" : "0" } as CSSProperties}
        modules={[A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination]}
        loop={multi}
        effect={reduce ? "slide" : "fade"}
        fadeEffect={{ crossFade: true }}
        speed={reduce ? 0 : BANNER_SPEED_MS}
        autoplay={multi && !reduce ? { delay: BANNER_INTERVAL_MS, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
        keyboard={{ enabled: true }}
        a11y={{ prevSlideMessage: "이전 배너", nextSlideMessage: "다음 배너" }}
        pagination={multi ? { el: null, clickable: true } : false}
        navigation={multi ? { prevEl: null, nextEl: null } : false}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        onBeforeInit={(swiper) =>
          attachSwiperControls(swiper, {
            prevEl: prevRef.current,
            nextEl: nextRef.current,
            paginationEl: paginationRef.current,
          })
        }
        onSlideChange={(swiper) => {
          /* loop 라 슬라이드마다 복사본이 있다. 번호는 realIndex 로 센다. 넘어갈 장과 그다음 장은 바로 받는다. */
          setIndex(swiper.realIndex);
          setLoaded((prev) => new Set([...prev, swiper.realIndex, (swiper.realIndex + 1) % count]));
        }}
        onAutoplayTimeLeft={(_swiper, _time, percentage) => setProgress(1 - percentage)}
      >
        {banners.map((banner, slideIndex) => (
          <SwiperSlide key={banner.bn_id} className="solune-banner-slide">
            <BannerSlide banner={banner} index={slideIndex} active={slideIndex === index} load={loaded.has(slideIndex)} />
          </SwiperSlide>
        ))}

        {multi ? (
          <>
            {/* 아래 표시줄. 시안대로 막대와 "01 / 06" 을 본문 기둥 폭 안에 둔다. */}
            <div slot="container-end" className="solune-banner-foot">
              <div ref={paginationRef} className="solune-banner-pagination swiper-pagination" />
              <div className="solune-banner-foot-right">
                <span className="solune-banner-count">
                  <b className="solune-banner-count-now">{pad(index + 1)}</b>
                  <span className="solune-banner-count-sep">/</span>
                  {pad(count)}
                </span>
                {/* 마우스를 올려 두면 멎지만 손가락과 키보드에는 그 길이 없다. 저절로 바뀌는 것은 멈출 수 있어야 한다. */}
                {!reduce ? (
                  <button
                    type="button"
                    className="solune-banner-play"
                    aria-pressed={paused}
                    aria-label={paused ? "자동 넘김 재생" : "자동 넘김 멈춤"}
                    onClick={togglePause}
                  >
                    {paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
                  </button>
                ) : null}
              </div>
            </div>
            <button ref={prevRef} slot="container-end" type="button" className="solune-banner-nav solune-banner-prev" aria-label="이전 배너">
              <ChevronLeft size={20} aria-hidden />
            </button>
            <button ref={nextRef} slot="container-end" type="button" className="solune-banner-nav solune-banner-next" aria-label="다음 배너">
              <ChevronRight size={20} aria-hidden />
            </button>
          </>
        ) : null}
      </Swiper>
    </div>
  );
}
