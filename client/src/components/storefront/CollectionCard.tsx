import { formatINR, type MenuItem } from "@/lib/types";

export default function CollectionCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  return (
    <div className="sf-card w-[220px] max-w-[70vw] shrink-0 overflow-hidden [-webkit-tap-highlight-color:transparent]">
      {item.image && (
        <div className="overflow-hidden">
          <img
            src={item.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 p-3">
        <p
          className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug"
          style={{ color: "var(--sf-text)" }}
        >
          {item.name}
        </p>
        <p
          className="mt-0.5 text-sm font-bold tabular-nums"
          style={{ color: "var(--sf-primary)" }}
        >
          {formatINR(item.price)}
        </p>
        <button onClick={onAdd} className="sf-add-btn mt-2 w-full cursor-pointer touch-manipulation transition-all duration-200 active:scale-95 [-webkit-tap-highlight-color:transparent]">
          ADD
        </button>
      </div>
    </div>
  );
}
