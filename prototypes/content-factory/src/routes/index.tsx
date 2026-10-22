import { createFileRoute } from "@tanstack/react-router";
import { LiveFactoryPage } from "../live/LiveFactoryPage";
export const Route = createFileRoute("/")({ ssr: false, component: LiveFactoryPage });
