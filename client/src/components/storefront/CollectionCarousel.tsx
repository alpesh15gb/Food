import { Flame } from "lucide-react";
import type { MenuItem } from "@/lib/types";
import CollectionCard from "./CollectionCard";

type Collection = {
  name: string;
  items: MenuItem[];
};

export default function CollectionCarousel({
  collections,
  onAdd,
}: {
  collections: Collection[];
  onAdd: (item: MenuItem) => void;
}) {
  if (!collections.length) return null;

  return (
    <div className="mb-6 space-y-6">
      {collections.map((collection) => (
        <div key={collection.name}>
          <div className="mb-3 flex items-center gap-2">
            <Flame
              className="h-4 w-4"
              style={{ color: "var(--sf-primary)" }}
            />
            <h3
              className="sf-heading text-sm"
              style={{ color: "var(--sf-text)" }}
            >
              {collection.name}
            </h3>
          </div>
          <div className="hide-scrollbar sf-edge-fade flex gap-3 overflow-x-auto pb-2">
            {collection.items.slice(0, 6).map((item) => (
              <CollectionCard
                key={item.id}
                item={item}
                onAdd={() => onAdd(item)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
