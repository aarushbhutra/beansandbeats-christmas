import type { ReactNode } from "react";
import { PreviewProvider } from "./preview-provider";
import "../../../app/globals.css";
import "./preview.css";
export const metadata = { title: "Person 2 preview · Beans & Beats", robots: { index: false, follow: false } };
export default function PreviewLayout({ children }: { children: ReactNode }) { return <html lang="en"><body><PreviewProvider><main>{children}</main></PreviewProvider></body></html>; }
