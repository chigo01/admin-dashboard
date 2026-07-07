"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import AuthGuard from "../components/AuthGuard";
import { API_BASE_URL } from "../config";
import {
  ManualEmailRecipientResult,
  ManualEmailSendResponse,
  ManualEmailUser,
  ManualEmailUsersResponse,
} from "../types";

const MAX_RECIPIENTS = 50;

export default function ManualEmailPage() {
  return (
    <AuthGuard>
      <ManualEmailContent />
    </AuthGuard>
  );
}

function getToken(): string | undefined {
  const token = Cookies.get("token");
  const userCookie = Cookies.get("user");
  if (userCookie) {
    try {
      const parsed = JSON.parse(userCookie);
      return parsed?.token || token;
    } catch {
      return token;
    }
  }
  return token;
}

function ManualEmailContent() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ManualEmailUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<ManualEmailUser[]>([]);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<ManualEmailRecipientResult[] | null>(
    null
  );

  useEffect(() => {
    const userCookie = Cookies.get("user");
    if (userCookie) {
      try {
        const parsed = JSON.parse(userCookie);
        setIsAdmin(parsed?.role === "admin");
      } catch {
        setIsAdmin(false);
      }
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const token = getToken();
    if (!token) return;

    setSearching(true);
    setSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/admin/manual-email/users?search=${encodeURIComponent(
            searchQuery.trim()
          )}&limit=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data: ManualEmailUsersResponse = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.message || "Search failed");
        }
        setSearchResults(data.users);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [searchQuery, authChecked, isAdmin]);

  const addRecipient = (user: ManualEmailUser) => {
    setSendResults(null);
    setRecipients((prev) =>
      prev.some((r) => r.email === user.email) ? prev : [...prev, user]
    );
  };

  const removeRecipient = (email: string) => {
    setSendResults(null);
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  const canSend =
    recipients.length > 0 &&
    recipients.length <= MAX_RECIPIENTS &&
    subject.trim().length > 0 &&
    bodyText.trim().length > 0;

  const handleSend = async () => {
    const token = getToken();
    if (!token) {
      setSendError("Session expired. Please log in again.");
      return;
    }

    setSending(true);
    setSendError(null);
    setSendResults(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/manual-email/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipients: recipients.map((r) => r.email),
          subject: subject.trim(),
          bodyText: bodyText.trim(),
        }),
      });
      const data: ManualEmailSendResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Send failed");
      }
      setSendResults(data.recipients);
      // Clear the compose form on a fully successful send; leave it in place
      // (with results shown) if anything failed, so the admin can retry.
      if (data.failed === 0) {
        setRecipients([]);
        setSubject("");
        setBodyText("");
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <p className="text-rose-400 text-xl">
          You are not authorized to view this page.
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Manual Email
          </h1>
          <p className="text-gray-400 mt-1">
            Send an ad-hoc email to specific customers (support, billing,
            etc.) &mdash; up to {MAX_RECIPIENTS} recipients per send, one at a
            time.
          </p>
        </div>

        {/* Recipient search */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 space-y-4">
          <Field label="Find users">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
            />
          </Field>

          {searching && (
            <p className="text-sm text-gray-500">Searching…</p>
          )}
          {searchError && (
            <p className="text-sm text-rose-400">{searchError}</p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {searchResults.map((user) => {
                const alreadyAdded = recipients.some(
                  (r) => r.email === user.email
                );
                return (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => addRecipient(user)}
                    disabled={alreadyAdded}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-black/30 border border-white/5 hover:bg-white/5 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div>
                      <div className="font-medium">
                        {user.name || "(no name)"}
                      </div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                    <span className="text-xs text-emerald-400 shrink-0">
                      {alreadyAdded ? "Added" : "+ Add"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected recipients */}
          {recipients.length > 0 && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              <span className="block text-xs uppercase tracking-widest text-gray-500">
                Recipients ({recipients.length}/{MAX_RECIPIENTS})
              </span>
              <div className="flex flex-wrap gap-2">
                {recipients.map((r) => (
                  <span
                    key={r.email}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm"
                  >
                    {r.name || r.email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.email)}
                      className="text-gray-500 hover:text-rose-400 transition-colors"
                      aria-label={`Remove ${r.email}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Compose */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 space-y-4">
          <Field label="Subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
            />
          </Field>

          <Field label="Message">
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write your message…"
              rows={8}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 resize-y"
            />
          </Field>

          {sendError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
              {sendError}
            </div>
          )}

          {sendResults && (
            <div className="space-y-1.5">
              <span className="block text-xs uppercase tracking-widest text-gray-500">
                Results
              </span>
              {sendResults.map((r) => (
                <div
                  key={r.email}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    r.status === "sent"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-rose-500/10 text-rose-300"
                  }`}
                >
                  <span>{r.email}</span>
                  <span>{r.status === "sent" ? "Sent" : r.error || "Failed"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={!canSend || sending}
              className="px-6 py-2.5 rounded-lg font-bold bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : `Send to ${recipients.length || 0}`}
            </button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={sending ? undefined : () => setShowConfirm(false)}
        >
          <div
            className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-2">
              Send this email now?
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              This will email {recipients.length} recipient
              {recipients.length === 1 ? "" : "s"} with subject &ldquo;
              {subject}&rdquo;. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-6 py-3 rounded-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "Sending…" : "Yes, Send"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={sending}
                className="px-6 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
