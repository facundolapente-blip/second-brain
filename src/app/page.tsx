import { redirect } from "next/navigation";

// Por ahora la app abre en Hábitos; cuando estén los otros módulos acá va el resumen del día.
export default function Home() {
  redirect("/habitos");
}
