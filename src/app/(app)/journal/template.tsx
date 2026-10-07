/** Se vuelve a montar al cambiar de pantalla: un fundido corto, solo de opacidad (sin desplazar nada). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
