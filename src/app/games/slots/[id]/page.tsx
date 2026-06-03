import { notFound } from "next/navigation";
import { SLOT_MACHINES } from "@/lib/slotMachines";
import SlotGame from "./SlotGame";

export async function generateStaticParams() {
  return SLOT_MACHINES.map((m) => ({ id: m.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = SLOT_MACHINES.find((m) => m.id === id);
  if (!config) notFound();
  return <SlotGame config={config} />;
}
