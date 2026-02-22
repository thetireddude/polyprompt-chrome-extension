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
  title: "EventSnap Dashboard",
  description: "Manage captured events synced from EventSnap extension"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${headline.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
