/**
 * Payload Admin UI — catch-all route.
 * Serves the Payload admin panel at /admin
 */

import { RootPage } from "@payloadcms/next/views";
import { importMap } from "../importMap.js";

export default RootPage;

export const generateMetadata = RootPage.generateMetadata;
export const dynamic = "force-dynamic";
