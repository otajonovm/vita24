export default function ProductGrid({ children }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
      {children}
    </div>
  );
}
