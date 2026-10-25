import { notFound } from "next/navigation";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getKrLinkOptions, getObjectives } from "@/lib/plan";
import { ObjectiveTreeView } from "./objective-tree-view";

export const metadata = { title: "Objetivo · Plan" };

/** El árbol de un objetivo: lo partís en objetivos más chicos y cada uno en tareas simples. */
export default async function ObjetivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await prisma.planObjective.findUnique({ where: { id }, select: { year: true } });
  if (!found) notFound();
  const [{ objectives }, links] = await Promise.all([getObjectives(found.year), getKrLinkOptions()]);
  const objective = objectives.find((o) => o.id === id);
  if (!objective) notFound();
  return <ObjectiveTreeView key={id} objective={objective} objectives={objectives} links={links} today={todayISO()} />;
}
