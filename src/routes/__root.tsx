import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TradesHorizons Live Chat" },
      { name: "description", content: "Admin live chat for tradeshorizons.vip" },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "TradesHorizons Live Chat" },
      { name: "twitter:title", content: "TradesHorizons Live Chat" },
      { property: "og:description", content: "Admin live chat for tradeshorizons.vip" },
      { name: "twitter:description", content: "Admin live chat for tradeshorizons.vip" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4eaa1664-c8fb-48bf-886f-515ffde5cfad/id-preview-a3ccea4d--dbb95bf9-fc33-4358-9f72-34e6f45b00ab.lovable.app-1778282856976.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4eaa1664-c8fb-48bf-886f-515ffde5cfad/id-preview-a3ccea4d--dbb95bf9-fc33-4358-9f72-34e6f45b00ab.lovable.app-1778282856976.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <a href="/" className="mt-4 inline-block text-primary underline">Go home</a>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6">
      <pre className="max-w-xl whitespace-pre-wrap text-sm text-destructive">{error.message}</pre>
    </div>
  ),
});

const queryClient = new QueryClient();

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
