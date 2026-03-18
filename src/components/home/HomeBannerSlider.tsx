import { useState, useEffect, useCallback } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { HomeBanner } from "@/lib/api/homeBanners";
import { cn } from "@/lib/utils";

const AUTOPLAY_INTERVAL_MS = 6000;

/** Altura fixa do banner em px (mantém área estável com zoom) */
const BANNER_HEIGHT_PX = 600;

/** Breakpoint md do Tailwind (768px): abaixo = mobile, acima = desktop */
const MOBILE_MAX_WIDTH_PX = 767;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_MAX_WIDTH_PX : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface HomeBannerSliderProps {
  banners: HomeBanner[];
  className?: string;
}

export function HomeBannerSlider({ banners, className }: HomeBannerSliderProps) {
  const isMobile = useIsMobile();
  const [api, setApi] = useState<CarouselApi | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback((api: CarouselApi | undefined) => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!api) return;
    onSelect(api);
    const handler = () => onSelect(api);
    api.on("select", handler);
    return () => api.off("select", handler);
  }, [api, onSelect]);

  useEffect(() => {
    if (!api || banners.length <= 1) return;
    const interval = setInterval(() => {
      api.scrollNext();
      if (!api.canScrollNext()) api.scrollTo(0);
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [api, banners.length]);

  // Desktop: só banners com image_url. Mobile: só banners com image_url_mobile.
  const visibleBanners = isMobile
    ? banners.filter((b) => b.image_url_mobile?.trim())
    : banners.filter((b) => b.image_url?.trim());

  if (visibleBanners.length === 0) return null;

  return (
    <section
      className={cn("relative overflow-hidden bg-muted", className)}
      style={{
        width: "100%",
        maxWidth: "100%",
        height: BANNER_HEIGHT_PX,
        minHeight: BANNER_HEIGHT_PX,
        maxHeight: BANNER_HEIGHT_PX,
      }}
      aria-label="Banners da página inicial"
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "start" }}
        className="h-full w-full"
        style={{ height: BANNER_HEIGHT_PX }}
      >
        <CarouselContent className="h-full -ml-0">
          {visibleBanners.map((banner, index) => (
            <CarouselItem key={banner.id} className="h-full pl-0 shrink-0 basis-full">
              <SlideContent
                banner={banner}
                index={index}
                heightPx={BANNER_HEIGHT_PX}
                imageUrl={isMobile ? (banner.image_url_mobile ?? "") : (banner.image_url ?? "")}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          className="left-4 h-10 w-10 border-2 border-white/80 bg-black/30 text-white hover:bg-black/50 hover:text-white"
          aria-label="Banner anterior"
        />
        <CarouselNext
          className="right-4 h-10 w-10 border-2 border-white/80 bg-black/30 text-white hover:bg-black/50 hover:text-white"
          aria-label="Próximo banner"
        />
        {visibleBanners.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {visibleBanners.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para banner ${idx + 1}`}
                aria-current={selectedIndex === idx}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  selectedIndex === idx
                    ? "bg-white w-6"
                    : "bg-white/50 hover:bg-white/80"
                )}
                onClick={() => api?.scrollTo(idx)}
              />
            ))}
          </div>
        )}
      </Carousel>
    </section>
  );
}

const imgStyle = (heightPx: number) => ({
  width: "100%",
  height: heightPx,
  minHeight: heightPx,
  maxHeight: heightPx,
  objectFit: "cover" as const,
});

function SlideContent({
  banner,
  index,
  heightPx,
  imageUrl,
}: {
  banner: HomeBanner;
  index: number;
  heightPx: number;
  imageUrl: string;
}) {
  const alt = banner.title?.trim() || `Banner ${index + 1}`;
  const containerStyle = {
    width: "100%",
    height: heightPx,
    minHeight: heightPx,
    maxHeight: heightPx,
    overflow: "hidden" as const,
  };
  const loading = index === 0 ? "eager" : "lazy";
  const img = (
    <img
      src={imageUrl}
      alt={alt}
      className="object-cover object-center"
      style={imgStyle(heightPx)}
      loading={loading}
    />
  );

  if (banner.link_url?.trim()) {
    return (
      <a
        href={banner.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={containerStyle}
      >
        {img}
      </a>
    );
  }

  return <div className="block" style={containerStyle}>{img}</div>;
}
