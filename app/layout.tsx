import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Free 3D Mockups",
    description: "Customize 3D models with interactive color changes and decal applications.",
    viewport: {
        width: "device-width",
        initialScale: 1,
        maximumScale: 5,
        userScalable: true,
        viewportFit: "cover"
    }
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="overflow-x-hidden">
            <body className="antialiased overflow-x-hidden">
                {children}
            </body>
        </html>
    );
}
