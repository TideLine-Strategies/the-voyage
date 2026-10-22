import { createFileRoute } from "@tanstack/react-router";
import FactoryPage from "@/features/content-factory/FactoryPage";
export const Route = createFileRoute("/")({ ssr: false, component: FactoryPage });
