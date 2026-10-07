import type { Metadata } from "next";
import { Classroom } from "@/components/classroom";

export const metadata: Metadata = {
  title: "黑白熊课堂 · 独立风格 Demo",
  description: "黑白熊风格的独立课堂演示，不是中文课堂的默认入口。",
};

export default function MonokumaStylePage() {
  return <Classroom />;
}
