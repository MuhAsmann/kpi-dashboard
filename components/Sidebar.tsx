"use client"
import { Calendar as CalendarIcon, HelpCircle, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";



const NAV_ITEMS: { icon: typeof LayoutDashboard; label: string; href?: string }[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CalendarIcon, label: "Calendar", href: "/calendar" },
];


export default function Sidebar() {
    const pathname = usePathname();

    return (
        <nav
            className="flex flex-col items-center sticky top-0 shrink-0"
            style={{
                width: "78px",
                background: "#1A1917",
                borderRight: "2px solid var(--card-border)",
                padding: "18px 0 22px",
                gap: "26px",
                height: "100vh",
            }}
        >
            <div
                className="grid place-items-center"
                style={{
                    width: "44px",
                    height: "44px",
                    background: "var(--accent)",
                    border: "2px solid var(--card-border)",
                    boxShadow: "3px 3px 0 #000",
                    fontFamily: "var(--font-mono), monospace",
                    fontWeight: 700,
                    fontSize: "20px",
                }}
            >
                ↗
            </div>
            <div className="flex flex-col gap-3.5 items-center mt-1.5">
                {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
                    const active = pathname === href;
                    const itemStyle: React.CSSProperties = {
                        width: "42px",
                        height: "42px",
                        background: active ? "var(--accent)" : "#2E2C29",
                        border: `2px solid ${active ? "var(--card-border)" : "#2E2C29"}`,
                        color: active ? "var(--text-primary)" : "#8B8781",
                    };

                    if (href) {
                        return (
                            <Link key={label} href={href} title={label} className="grid place-items-center" style={itemStyle}>
                                <Icon size={17} />
                            </Link>
                        );
                    }
                    return (
                        <div key={label} title={active ? label : `${label} (not available yet)`} className="grid place-items-center" style={itemStyle}>
                            <Icon size={17} />
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-col gap-3.5 items-center mt-auto">
                {[Settings, HelpCircle].map((Icon, i) => (
                    <div
                        key={i}
                        className="grid place-items-center"
                        style={{ width: "42px", height: "42px", background: "#2E2C29", border: "2px solid #2E2C29", color: "#8B8781" }}
                    >
                        <Icon size={17} />
                    </div>
                ))}
            </div>
        </nav>
    );
}