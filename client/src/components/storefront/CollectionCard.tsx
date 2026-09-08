import { formatINR, type MenuItem } from "@/lib/types";

export default function CollectionCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  return (
    <div className="sf-card w-[220px] shrink-0 overflow-hidden">
      {item.image && (
        <div className="overflow-hidden">
          <img
            src={item.image}
            alt=""
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      )}
      <div className="p-3">
        <p
          className="truncate text-sm font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {item.name}
        </p>
        <p
          className="mt-0.5 text-sm font-bold"
          style={{ color: "var(--sf-primary)" }}
        >
          {formatINR(item.price)}
        </p>
        <button onClick={onAdd} className="sf-add-btn mt-2 w-full">
          ADD
        </button>
      </div>
    </div>
  );
}
