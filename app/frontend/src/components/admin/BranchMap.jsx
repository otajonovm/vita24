const Z = 16;

function lonToX(lon) {
  return ((lon + 180) / 360) * 2 ** Z;
}

function latToY(lat) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** Z;
}

function xToLon(x) {
  return (x / 2 ** Z) * 360 - 180;
}

function yToLat(y) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** Z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export default function BranchMap({ lat, lng, onPick }) {
  const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: 41.3111, lng: 69.2797 };
  const cx = lonToX(point.lng);
  const cy = latToY(point.lat);
  const tileX = Math.floor(cx);
  const tileY = Math.floor(cy);
  const tiles = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      tiles.push({ x: tileX + dx, y: tileY + dy });
    }
  }

  function pick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = cx + (event.clientX - rect.left - rect.width / 2) / 256;
    const worldY = cy + (event.clientY - rect.top - rect.height / 2) / 256;
    onPick({
      lat: Math.round(yToLat(worldY) * 1e5) / 1e5,
      lng: Math.round(xToLon(worldX) * 1e5) / 1e5,
    });
  }

  return (
    <button
      type="button"
      onClick={pick}
      className="relative h-52 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      aria-label="Xaritadan nuqta"
    >
      {tiles.map((tile) => (
        <img
          key={`${tile.x}-${tile.y}`}
          alt=""
          draggable={false}
          src={`https://tile.openstreetmap.org/${Z}/${tile.x}/${tile.y}.png`}
          className="absolute h-64 w-64 max-w-none"
          style={{
            left: `calc(50% + ${(tile.x - cx) * 256}px)`,
            top: `calc(50% + ${(tile.y - cy) * 256}px)`,
          }}
        />
      ))}
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#087B51] shadow" />
    </button>
  );
}
