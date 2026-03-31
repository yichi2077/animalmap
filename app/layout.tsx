import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "澳洲野生动物时空图谱 | Australia Wild Time Atlas",
  description: "一张会随着时间呼吸的澳大利亚自然绘本地图",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="parchment-bg">{children}</body>
    </html>
  );
}
