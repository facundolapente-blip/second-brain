import { PageFade } from "@/components/page-fade";

/** Se vuelve a montar en cada navegación; `PageFade` hace el fundido solo al cambiar de pantalla. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
