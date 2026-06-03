"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { API_BASE_URL } from "../config";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Check for user in cookies whenever pathname changes
    const checkUser = () => {
      const storedUser = Cookies.get("user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    checkUser();
  }, [pathname]); // Re-run when pathname changes

  const handleLogout = async () => {
    try {
      const token = Cookies.get("token");
      if (token) {
        // Call server to blacklist the token
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always clear cookies and redirect
      Cookies.remove("token");
      Cookies.remove("user");
      setUser(null);
      window.location.href = "/login";
    }
  };

  // Generate Forex Factory calendar URL with dynamic date range (10 days behind current day)
  const getCalendarUrl = () => {
    const today = new Date();
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);

    const formatDate = (date: Date) => {
      const months = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      return `${month}${day}.${year}`;
    };

    const startDate = formatDate(tenDaysAgo);
    const endDate = formatDate(today);
    return `https://www.forexfactory.com/calendar?range=${startDate}-${endDate}`;
  };

  return (
    <nav className="w-full border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
          >
            FX Signals
          </Link>
          {/* Desktop Menu */}
          {user && (
            <div className="hidden md:flex items-center gap-6">
              <NavLink href="/?category=fiat">Fiat</NavLink>
              <NavLink href="/?category=crypto">Crypto</NavLink>
              <NavLink href="/?category=gold">Gold</NavLink>
              <NavLink href="/?category=stocks">Stocks</NavLink>
              <NavLink href="/history">History</NavLink>
              {user?.role === "admin" && (
                <NavLink href="/approval-requests">Approvals</NavLink>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <a
              href={getCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex text-sm text-gray-400 hover:text-white transition-colors items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-white/10 border border-white/5"
            >
              <span className="text-red-700 font-bold">FX Daily News</span>
            </a>
          )}
          {user && (
            <a
              href="https://www.tradingview.com/markets/currencies/news/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex text-sm text-gray-400 hover:text-white transition-colors items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-white/10 border border-white/5"
            >
              <span className="text-red-700 font-bold">TradingView News</span>
            </a>
          )}

          {/* Auth Buttons Desktop */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">
                  Hi, {user.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-black bg-white hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            {isOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl absolute w-full left-0 top-16 p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
          {user && (
            <>
              <MobileNavLink
                href="/?category=fiat"
                onClick={() => setIsOpen(false)}
              >
                Fiat
              </MobileNavLink>
              <MobileNavLink
                href="/?category=crypto"
                onClick={() => setIsOpen(false)}
              >
                Crypto
              </MobileNavLink>
              <MobileNavLink
                href="/?category=gold"
                onClick={() => setIsOpen(false)}
              >
                Gold
              </MobileNavLink>
              <MobileNavLink
                href="/?category=stocks"
                onClick={() => setIsOpen(false)}
              >
                Stocks
              </MobileNavLink>
              <MobileNavLink
                href="/history"
                onClick={() => setIsOpen(false)}
              >
                History
              </MobileNavLink>
              {user?.role === "admin" && (
                <MobileNavLink
                  href="/approval-requests"
                  onClick={() => setIsOpen(false)}
                >
                  Approvals
                </MobileNavLink>
              )}

              <hr className="border-white/10" />
            </>
          )}

          {user ? (
            <>
              <div className="px-4 py-2 text-sm text-gray-400">
                Signed in as <span className="text-white">{user.username}</span>
              </div>
              <button
                onClick={() => {
                  handleLogout();
                  setIsOpen(false);
                }}
                className="text-base font-medium text-red-400 hover:text-red-300 transition-colors hover:bg-white/5 px-4 py-3 rounded-lg block text-left w-full"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <MobileNavLink href="/login" onClick={() => setIsOpen(false)}>
                Log In
              </MobileNavLink>
              <MobileNavLink href="/register" onClick={() => setIsOpen(false)}>
                Sign Up
              </MobileNavLink>
            </>
          )}

          {user && <hr className="border-white/10" />}

          {user && (
            <a
              href={getCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors px-4 py-3 rounded-lg hover:bg-white/5"
              onClick={() => setIsOpen(false)}
            >
              <span>📅</span>
              <span>Economic Calendar</span>
            </a>
          )}
        </div>
      )}
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-gray-400 hover:text-white transition-colors hover:bg-white/5 px-3 py-1.5 rounded-lg"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="text-base font-medium text-gray-400 hover:text-white transition-colors hover:bg-white/5 px-4 py-3 rounded-lg block"
    >
      {children}
    </Link>
  );
}
