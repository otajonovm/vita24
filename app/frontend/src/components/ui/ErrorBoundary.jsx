import { Component } from "react";

const RELOAD_KEY = "vita24-chunk-reload";

export function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.name === "ChunkLoadError" ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

export function CrashScreen({ onReload }) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 py-16">
      <div className="max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-extrabold text-slate-900">Nimadir xato ketdi</h1>
        <p className="mt-2 text-sm text-slate-500">Sahifani yangilab, qayta urinib ko'ring.</p>
        <button
          type="button"
          onClick={onReload || (() => window.location.reload())}
          className="mt-4 h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white"
        >
          Sahifani yangilash
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (typeof window === "undefined") return;
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(RELOAD_KEY);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <CrashScreen />;
    }
    return this.props.children;
  }
}
