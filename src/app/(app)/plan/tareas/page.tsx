import { redirect } from "next/navigation";

// Las tareas viven arriba de la semana, en la misma página (como en Notion).
export default function TareasPage() {
  redirect("/plan#tareas");
}
