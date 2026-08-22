import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ShieldCheck, Truck } from "lucide-react";

const SLIDES = [
  {
    id: "delivery",
    title: "24/7 Tezkor yetkazish",
    text: "Toshkent bo'ylab 30 daqiqada!",
    Icon: Truck,
    tone: "from-brand to-[#0d9488]",
  },
  {
    id: "vitamins",
    title: "Mavsumiy profilaktika",
    text: "Vitaminlar to'plamiga 20% chegirma",
    Icon: ShieldCheck,
    tone: "from-[#066341] to-brand",
  },
  {
    id: "rx",
    title: "Retseptingiz bormi?",
    text: "Suratini yuklang va tez qabul qiling",
    Icon: FileText,
    tone: "from-[#0f766e] to-brand",
  },
];

export default function PromoCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const go = (direction) => {
    setIndex((current) => (current + direction + SLIDES.length) % SLIDES.length);
  };

  const slide = SLIDES[index];
  const Icon = slide.Icon;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
      <div className={`bg-gradient-to-r ${slide.tone} px-6 py-10 text-white md:px-10 md:py-14`}>
        <div className="flex max-w-xl flex-col gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <Icon className="h-6 w-6" />
          </span>
          <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">{slide.title}</h1>
          <p className="text-lg text-white/90">{slide.text}</p>
        </div>
      </div>

      <button
        type="button"
        aria-label="Oldingi slayd"
        onClick={() => go(-1)}
        className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Keyingi slayd"
        onClick={() => go(1)}
        className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((item, dotIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={`${dotIndex + 1}-slayd`}
            onClick={() => setIndex(dotIndex)}
            className={`h-2.5 rounded-full transition-all ${
              dotIndex === index ? "w-6 bg-white" : "w-2.5 bg-white/50"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
