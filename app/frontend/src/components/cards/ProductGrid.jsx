export default function ProductGrid({ children }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
      {children}
    </div>
  );
}
