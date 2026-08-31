/** Market Table design: public customers stay on the direct restaurant ordering journey. */
import { useParams } from "wouter";
import OrderingApp from "@/components/OrderingApp";

export default function Home() {
  const params = useParams<{ slug?: string }>();
  return <OrderingApp slug={params.slug} />;
}
