/** Market Table design: public customers stay on the direct restaurant ordering journey. */
import { useParams } from "wouter";
import OrderingApp from "@/components/OrderingApp";

export default function Home() {
  const params = useParams<{ slug?: string; number?: string }>();
  // /order/:number is guest order tracking — no storefront slug in the path.
  if (params.number) return <OrderingApp trackingNumber={params.number} />;
  return <OrderingApp slug={params.slug} />;
}
