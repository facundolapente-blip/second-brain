import { notFound } from "next/navigation";
import { getAllTags, getEntry } from "@/lib/journal";
import { formatLong, todayISO } from "@/lib/dates";
import { Editor } from "./editor";

export async function generateMetadata({ params }: PageProps<"/journal/[id]">) {
  const e = await getEntry((await params).id);
  if (!e) return { title: "Journal" };
  return { title: `${e.title || formatLong(e.date)} · Journal` };
}

export default async function EntryPage({ params }: PageProps<"/journal/[id]">) {
  const { id } = await params;
  const [entry, tags] = await Promise.all([getEntry(id), getAllTags()]);
  if (!entry) notFound();
  return <Editor key={entry.id} entry={entry} allTags={tags} today={todayISO()} />;
}
