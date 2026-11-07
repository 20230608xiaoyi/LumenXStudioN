import "./globals.css";
import EnvConfigChecker from "@/components/EnvConfigChecker";
import { Providers } from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="dark" suppressHydrationWarning>
      <head>
        <title>LumenX Studio</title>
        <meta name="description" content="AI-Native Motion Comic Creation Platform" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=JSON.parse(localStorage.getItem("lumenx-settings")||"{}");var t=d.state&&d.state.theme;if(t==="light"||t==="dark"){document.documentElement.className=t}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <Providers>
          <EnvConfigChecker />
          {children}
        </Providers>
      </body>
    </html>
  );
}
