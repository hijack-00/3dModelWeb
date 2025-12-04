import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Free 3D Mockups",
    description: "Customize 3D models with interactive color changes and decal applications.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                {children}
            </body>
        </html>
    );
}
