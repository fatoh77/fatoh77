import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import storeCss from "../store/store.css?url";
import { storeMarkup } from "../store/markup";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الأمين | خيرات الأرض لحد بابك" },
      { name: "description", content: "لب وسناكس ومحاصيل مختارة من مزارعنا، متعبّية بحب وجاهزة توصلك طازة. الدفع عند الاستلام." },
      { property: "og:title", content: "الأمين | خيرات الأرض لحد بابك" },
      { property: "og:description", content: "لب وسناكس ومحاصيل مختارة من مزارعنا، توصيل لجميع المحافظات والدفع عند الاستلام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#f7f6ef" },
    ],
    links: [{ rel: "stylesheet", href: storeCss }],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("../store/app").then(({ initStore }) => {
      if (!cancelled) cleanup = initStore();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: storeMarkup }} />;
}
