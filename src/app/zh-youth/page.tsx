import type { Metadata } from "next";
import { YouthClassroom } from "@/components/youth/youth-classroom";
import "./youth.css";

export const metadata: Metadata = {
  title: "中文课堂",
  description: "从自己的问题出发，围绕问题内容展开讲解的中文视频课堂。",
};
export default function YouthPage() { return <YouthClassroom />; }
