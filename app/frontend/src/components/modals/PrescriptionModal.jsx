import { useState } from "react";
import { FileCheck, UploadCloud, XCircle } from "lucide-react";
import { useCartStore } from "../../store/useCartStore";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function PrescriptionModal({ open, onClose }) {
  const setPrescription = useCartStore((state) => state.setPrescription);
  const prescription = useCartStore((state) => state.prescription);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const readFile = (file) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setError("Faqat JPG, PNG, WEBP yoki PDF qabul qilinadi");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Fayl hajmi 6 MB dan oshmasin");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPrescription({
        fileName: file.name,
        fileUrl: String(reader.result),
        status: "PENDING",
      });
      setError("");
      onClose();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/45 p-0 md:items-center md:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-100 bg-white p-4 shadow-sm md:rounded-2xl md:p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="rx-modal-title"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand">Retsept</p>
            <h2 id="rx-modal-title" className="mt-1 text-2xl font-extrabold">
              Retseptni yuklang
            </h2>
          </div>
          <button
            type="button"
            aria-label="Yopish"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-50"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Retseptli dorilar uchun shifokor retseptining surati yoki PDF nusxasi kerak.
          Farmatsevt 15 daqiqa ichida tekshiradi.
        </p>

        <label
          className={`grid min-h-40 cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-brand-soft p-5 text-center ${
            isDragging ? "bg-emerald-100" : ""
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            readFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept={ACCEPT.join(",")}
            hidden
            onChange={(event) => readFile(event.target.files?.[0])}
          />
          {prescription?.fileName ? (
            <FileCheck className="h-8 w-8 text-brand" />
          ) : (
            <UploadCloud className="h-8 w-8 text-brand" />
          )}
          <strong>Faylni shu yerga tashlang</strong>
          <span className="text-sm text-slate-500">yoki bosib tanlang</span>
          {prescription?.fileName && (
            <em className="text-sm not-italic text-brand">Yuklangan: {prescription.fileName}</em>
          )}
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
