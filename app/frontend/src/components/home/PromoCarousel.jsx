import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileText, ShieldCheck, Truck } from "lucide-react";

const SLIDES = [
  {
    id: "rx",
    titleKey: "promo.rxTitle",
    textKey: "promo.rxText",
    hintKey: "promo.rxHint",
    Icon: FileText,
  },
  {
    id: "delivery",
    titleKey: "promo.deliveryTitle",
    textKey: "promo.deliveryText",
    hintKey: "promo.paymentHint",
    Icon: Truck,
  },
  {
    id: "care",
    titleKey: "promo.careTitle",
    textKey: "promo.careText",
    hintKey: "promo.careHint",
    Icon: ShieldCheck,
  },
];

export default function PromoCarousel({ onUpload }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const startX = useRef(0);
  const deltaX = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const go = (direction) => {
    setIndex((current) => (current + direction + SLIDES.length) % SLIDES.length);
  };

  const onStart = (clientX) => {
    startX.current = clientX;
    deltaX.current = 0;
  };

  const onMove = (clientX) => {
    if (!startX.current) return;
    deltaX.current = clientX - startX.current;
  };

  const onEnd = () => {
    if (deltaX.current > 40) go(-1);
    else if (deltaX.current < -40) go(1);
    startX.current = 0;
    deltaX.current = 0;
  };

  const slide = SLIDES[index];
  const Icon = slide.Icon;

  return (
    <section className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-white/10 md:h-52 md:w-52 lg:-right-6 lg:h-72 lg:w-72"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-16 hidden h-36 w-36 rounded-full bg-white/10 md:block lg:right-40 lg:h-48 lg:w-48"
      />

      <div
        className="relative flex h-36 w-full select-none items-center px-4 md:h-52 md:px-16 lg:h-64 lg:px-20"
        onTouchStart={(event) => onStart(event.touches[0].clientX)}
        onTouchMove={(event) => onMove(event.touches[0].clientX)}
        onTouchEnd={onEnd}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-3 md:gap-4">
          <div className="flex min-w-0 max-w-2xl items-center gap-3 md:gap-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15 md:h-14 md:w-14 lg:h-16 lg:w-16">
              <Icon className="h-5 w-5 md:h-7 md:w-7 lg:h-8 lg:w-8" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold leading-tight md:text-2xl lg:text-3xl">
                {t(slide.titleKey)}
              </h1>
              <p className="mt-1 line-clamp-2 text-xs text-white/90 md:mt-1.5 md:line-clamp-none md:text-sm lg:text-lg">
                {t(slide.textKey)}
              </p>
              {slide.id === "rx" && (
                <button
                  type="button"
                  onClick={onUpload}
                  className="mt-3 inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-bold text-[#087B51]"
                >
                  {t("promo.rxAction")}
                </button>
              )}
              <p className="mt-2 hidden text-xs font-semibold uppercase tracking-wider text-white/70 md:block">
                {t(slide.hintKey)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label={t("promo.prev")}
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm md:grid lg:left-3 lg:h-11 lg:w-11"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={t("promo.next")}
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm md:grid lg:right-3 lg:h-11 lg:w-11"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 md:bottom-3">
        {SLIDES.map((item, dotIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={t("promo.dot", { n: dotIndex + 1 })}
            onClick={() => setIndex(dotIndex)}
            className={`h-2 rounded-full transition-all ${
              dotIndex === index ? "w-5 bg-white" : "w-2 bg-white/45"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
