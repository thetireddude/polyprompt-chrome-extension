import { Space_Grotesk, Bitter } from "next/font/google";
import "./globals.css";

const headline = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline"
});

const body = Bitter({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata = {
  title: "PolySync Dashboard",
  description: "Manage captured events synced from the PolySync extension"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${headline.variable} ${body.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem("polysync-theme") || "dark";
                  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
                } catch (err) {
                  document.documentElement.dataset.theme = "dark";
                }
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
