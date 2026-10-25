import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/** La dirección vieja de un objetivo: ahora se abre en las columnas de Objetivos. */
export default async function ObjetivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await prisma.planObjective.findUnique({ where: { id }, select: { year: true } });
  if (!found) notFound();
  redirect(`/plan/objetivos?anio=${found.year}&o=${id}`);
}
