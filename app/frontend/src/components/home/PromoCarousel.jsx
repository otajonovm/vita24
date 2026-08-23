import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ShieldCheck, Truck } from "lucide-react";

const SLIDES = [
  {
    id: "rx",
    title: "Retseptingiz bormi?",
    text: "Suratini yuklang va tez qabul qiling",
    hint: "JPG, PNG yoki PDF",
    Icon: FileText,
  },
  {
    id: "delivery",
    title: "24/7 tezkor yetkazish",
    text: "Toshkent bo'ylab 30 daqiqada",
    hint: "15 daqiqalik zaxira",
    Icon: Truck,
  },
  {
    id: "care",
    title: "Farmatsevt nazorati",
    text: "Har bir buyurtma filialda tekshiriladi",
    hint: "Litsenziyalangan tarmoq",
    Icon: ShieldCheck,
  },
];

export default function PromoCarousel() {
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
    <section className="@container relative w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-36 w-36 rounded-full bg-white/10 @[768px]:h-52 @[768px]:w-52 @[1024px]:-right-6 @[1024px]:h-72 @[1024px]:w-72"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-16 hidden h-36 w-36 rounded-full bg-white/10 @[768px]:block @[1024px]:right-40 @[1024px]:h-48 @[1024px]:w-48"
      />

      <div
        className="relative flex h-40 w-full select-none items-center px-4 @[768px]:h-52 @[768px]:px-8 @[1024px]:h-64 @[1024px]:px-14"
        onTouchStart={(event) => onStart(event.touches[0].clientX)}
        onTouchMove={(event) => onMove(event.touches[0].clientX)}
        onTouchEnd={onEnd}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 max-w-2xl items-center gap-3 @[768px]:gap-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 @[768px]:h-14 @[768px]:w-14 @[1024px]:h-16 @[1024px]:w-16">
              <Icon className="h-5 w-5 @[768px]:h-7 @[768px]:w-7 @[1024px]:h-8 @[1024px]:w-8" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold leading-tight @[768px]:text-2xl @[1024px]:text-3xl">
                {slide.title}
              </h1>
              <p className="mt-1 truncate text-xs text-white/90 @[768px]:mt-1.5 @[768px]:whitespace-normal @[768px]:text-sm @[1024px]:text-lg">
                {slide.text}
              </p>
              <p className="mt-2 hidden text-xs font-semibold uppercase tracking-wider text-white/70 @[768px]:block">
                {slide.hint}
              </p>
            </div>
          </div>

          <div className="hidden shrink-0 rounded-2xl bg-white/12 px-4 py-3 text-right backdrop-blur-sm @[1024px]:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Vita24</p>
            <p className="mt-1 text-sm font-bold leading-snug">{slide.hint}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Oldingi slayd"
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm @[768px]:grid @[1024px]:left-3 @[1024px]:h-11 @[1024px]:w-11"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Keyingi slayd"
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm @[768px]:grid @[1024px]:right-3 @[1024px]:h-11 @[1024px]:w-11"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 @[768px]:bottom-3">
        {SLIDES.map((item, dotIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={`${dotIndex + 1}-slayd`}
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
