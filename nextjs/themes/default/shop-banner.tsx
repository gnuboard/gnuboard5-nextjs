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

/** 이미 있는 묶음에 번호를 더한다. 더할 것이 없으면 같은 묶음을 돌려 다시 그리지 않게 한다. */
function withSlides(prev: ReadonlySet<number>, slides: number[]): ReadonlySet<number> {
  if (slides.every((slide) => prev.has(slide))) return prev;
  return new Set([...prev, ...slides]);
}

function BannerSlide({
  banner,
  index,
  active,
  load,
  onSettled,
}: {
  banner: ShopBanner;
  index: number;
  active: boolean;
  load: boolean;
  /** 사진을 다 받았거나(실패 포함) 이미 받아 둔 상태일 때. */
  onSettled?: () => void;
}) {
  const { eyebrow, title } = splitBannerCopy(banner.bn_alt);
  const { href, external } = bannerHref(banner);
  const imgRef = useRef<HTMLImageElement>(null);

  /* 캐시에 있던 사진은 붙기도 전에 다 받아져 onLoad 를 놓친다. complete 만 보면 안 된다 —
     src 를 막 넣은 직후에도 true 로 나와(아직 요청 전) 앞뒤 장이 첫 장과 함께 내려간다.
     크기를 아는 것은 실제로 다 받은 사진뿐이다. */
  useEffect(() => {
    const img = imgRef.current;
    if (load && img?.complete && img.naturalWidth > 0) onSettled?.();
  }, [load, onSettled]);

  const image = (
    <img
      ref={imgRef}
      className={`solune-banner-img${banner.bn_border ? " sbn_border" : ""}`}
      /* 겹쳐 녹이는(fade) 효과라 여섯 장이 한자리에 쌓여 loading="lazy" 가 듣지 않는다.
         그래서 load 가 켜진 장만 받는다 — 첫 장, 그리고 지금 장의 앞뒤. */
      src={load ? normalizeG5ImageSrc(banner.image_url) : undefined}
      /* 1440(레퍼런스 배너와 같은 폭) · 1920 — 배너는 화면 폭을 다 쓰므로 큰 화면에서만 1920 을 받는다. */
      srcSet={load && banner.image_srcset ? banner.image_srcset : undefined}
      sizes={banner.image_srcset ? "100vw" : undefined}
      onLoad={onSettled}
      onError={onSettled}
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
  /* 처음에는 첫 장만 받는다. 배너는 API 응답 뒤에 그려져 그때는 이미 페이지 load 가
     지난 뒤라, "load 뒤에 전부" 로 두면 첫 장과 나머지가 한꺼번에 내려가 첫 장이
     대역폭을 나눠 쓴다(여섯 장 약 930KB). */
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]));

  /* 첫 장이 보인 뒤에 앞뒤 장을 받아 둔다 — 다음으로 넘기든 이전으로 넘기든 바로 보이게. */
  const firstSettledRef = useRef(false);
  const warmNeighbours = useCallback(() => {
    firstSettledRef.current = true;
    if (count > 1) setLoaded((prev) => withSlides(prev, [1, count - 1]));
  }, [count]);

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
          /* loop 라 슬라이드마다 복사본이 있다. 번호는 realIndex 로 센다. 지금 장과 그 앞뒤 장은 바로 받는다.
             다만 loop 는 처음 세울 때도 이 이벤트를 한 번 낸다 — 그때(첫 장이 아직 받는 중)는
             앞뒤 장을 미뤄 둔다. 첫 장이 다 받아지면 warmNeighbours 가 채운다. */
          const current = swiper.realIndex;
          setIndex(current);
          const slides =
            current === 0 && !firstSettledRef.current
              ? [current]
              : [current, (current + 1) % count, (current - 1 + count) % count];
          setLoaded((prev) => withSlides(prev, slides));
        }}
        onAutoplayTimeLeft={(_swiper, _time, percentage) => setProgress(1 - percentage)}
      >
        {banners.map((banner, slideIndex) => (
          <SwiperSlide key={banner.bn_id} className="solune-banner-slide">
            <BannerSlide
              banner={banner}
              index={slideIndex}
              active={slideIndex === index}
              load={loaded.has(slideIndex)}
              onSettled={slideIndex === 0 ? warmNeighbours : undefined}
            />
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
