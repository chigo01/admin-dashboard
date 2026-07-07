"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import AuthGuard from "../components/AuthGuard";
import { API_BASE_URL } from "../config";
import {
  ManualEmailBroadcastResponse,
  ManualEmailJob,
  ManualEmailJobResponse,
  ManualEmailJobsListResponse,
  ManualEmailPreviewResponse,
  ManualEmailRecipientResult,
  ManualEmailSendResponse,
  ManualEmailUser,
  ManualEmailUsersResponse,
} from "../types";

const ACTIVE_JOB_STATUSES = new Set(["queued", "in_progress"]);

const MAX_RECIPIENTS = 50;

// A starting draft in the same voice as the other Signova customer emails
// (see admin-server's weeklyNewsletter.ts template: "Hey {firstName}" opener,
// "message us directly — it goes straight to us" close, "Signova Team" sign-off)
// so admins edit an existing draft instead of writing one from a blank page.
const STARTER_TEMPLATE = {
  subject: "A quick note from the Signova team",
  bodyText: `Hey there,

Wanted to reach out about your Signova account.

[Add your message here]

If you have any questions, just reply to this email — it goes straight to us.

Signova Team`,
};

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

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ManualEmailJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<ManualEmailJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);

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

  const loadStarterTemplate = () => {
    setSubject(STARTER_TEMPLATE.subject);
    setBodyText(STARTER_TEMPLATE.bodyText);
  };

  const handlePreview = async () => {
    const token = getToken();
    if (!token) {
      setPreviewError("Session expired. Please log in again.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/manual-email/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject, bodyText }),
      });
      const data: ManualEmailPreviewResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Preview failed");
      }
      setPreviewHtml(data.html);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const fetchRecentJobs = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/manual-email/jobs?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: ManualEmailJobsListResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Failed to load broadcasts");
      }
      setJobsError(null);
      setRecentJobs(data.jobs);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : "Failed to load broadcasts");
    }
  };

  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    fetchRecentJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, isAdmin]);

  // Poll the active broadcast job until it leaves queued/in_progress, so an
  // admin who stays on the page sees live progress without a manual refresh.
  useEffect(() => {
    if (!activeJob || !ACTIVE_JOB_STATUSES.has(activeJob.status)) return;

    const token = getToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/admin/manual-email/jobs/${activeJob.jobId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data: ManualEmailJobResponse = await res.json();
        if (!res.ok || !data.ok) return;
        setActiveJob(data);
        setRecentJobs((prev) =>
          prev.map((j) => (j.jobId === data.jobId ? data : j))
        );
      } catch {
        /* transient — try again on the next tick */
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeJob?.jobId, activeJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBroadcast = async () => {
    const token = getToken();
    if (!token) {
      setBroadcastError("Session expired. Please log in again.");
      return;
    }

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/manual-email/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: subject.trim(), bodyText: bodyText.trim() }),
      });
      const data: ManualEmailBroadcastResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Broadcast failed to start");
      }
      setActiveJob(data);
      setRecentJobs((prev) => [data, ...prev.filter((j) => j.jobId !== data.jobId)]);
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : "Broadcast failed to start");
    } finally {
      setBroadcasting(false);
      setShowBroadcastConfirm(false);
    }
  };

  const canSend =
    recipients.length > 0 &&
    recipients.length <= MAX_RECIPIENTS &&
    subject.trim().length > 0 &&
    bodyText.trim().length > 0;

  const jobInFlight = !!activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status);
  const canBroadcast =
    subject.trim().length > 0 && bodyText.trim().length > 0 && !jobInFlight;

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
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-widest text-gray-500">
              Compose
            </span>
            <button
              type="button"
              onClick={loadStarterTemplate}
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Use starter template
            </button>
          </div>

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

          {previewError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
              {previewError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={(!subject.trim() && !bodyText.trim()) || previewLoading}
              className="px-5 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {previewLoading ? "Loading…" : "Preview"}
            </button>
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

        {/* Broadcast to everyone — uses the same subject/message above, but
            targets the entire end-user base as a background job instead of
            the hand-picked recipient list. */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-rose-500/10 space-y-4">
          <div>
            <span className="block text-xs uppercase tracking-widest text-rose-400/80">
              Broadcast
            </span>
            <p className="text-gray-400 text-sm mt-1">
              Send the subject/message above to every user in the database,
              not just the recipients you picked. Runs as a background job
              &mdash; you can leave this page and check back.
            </p>
          </div>

          {broadcastError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
              {broadcastError}
            </div>
          )}

          {activeJob && (
            <JobProgress job={activeJob} />
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowBroadcastConfirm(true)}
              disabled={!canBroadcast || broadcasting}
              className="px-6 py-2.5 rounded-lg font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {broadcasting
                ? "Starting…"
                : jobInFlight
                ? "Broadcast in progress…"
                : "Send to all users"}
            </button>
          </div>
        </div>

        {/* Recent broadcasts */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-widest text-gray-500">
              Recent broadcasts
            </span>
            <button
              type="button"
              onClick={fetchRecentJobs}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>

          {jobsError && <p className="text-sm text-rose-400">{jobsError}</p>}

          {recentJobs.length === 0 ? (
            <p className="text-sm text-gray-500">No broadcasts sent yet.</p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div
                  key={job.jobId}
                  className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium truncate">
                      {job.subject}
                    </span>
                    <StatusPill status={job.status} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString()} &middot;{" "}
                    {job.sentCount}/{job.totalRecipients} sent
                    {job.failedCount > 0 ? `, ${job.failedCount} failed` : ""}
                  </div>
                  {job.error && (
                    <div className="text-xs text-rose-400">{job.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
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

      {previewHtml !== null && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Email Preview</h2>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <p className="text-gray-500 text-xs mb-4">
              This is exactly what the recipient will see.
            </p>
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              sandbox=""
              className="w-full h-[70vh] rounded-lg border border-white/10 bg-white"
            />
          </div>
        </div>
      )}

      {showBroadcastConfirm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={broadcasting ? undefined : () => setShowBroadcastConfirm(false)}
        >
          <div
            className="bg-zinc-900 border border-rose-500/20 rounded-2xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-2">
              Email every user in the database?
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              This sends subject &ldquo;{subject}&rdquo; to every end-user,
              not just the {recipients.length || 0} recipient
              {recipients.length === 1 ? "" : "s"} you picked above. It runs
              in the background and <strong className="text-rose-300">cannot be undone</strong>{" "}
              once started.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleBroadcast}
                disabled={broadcasting}
                className="px-6 py-3 rounded-lg font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {broadcasting ? "Starting…" : "Yes, email everyone"}
              </button>
              <button
                onClick={() => setShowBroadcastConfirm(false)}
                disabled={broadcasting}
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

function StatusPill({ status }: { status: ManualEmailJob["status"] }) {
  const styles: Record<ManualEmailJob["status"], string> = {
    queued: "bg-gray-500/10 text-gray-300 border-gray-500/20",
    in_progress: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    failed: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  };
  const labels: Record<ManualEmailJob["status"], string> = {
    queued: "Queued",
    in_progress: "In progress",
    completed: "Completed",
    failed: "Failed",
  };
  return (
    <span
      className={`shrink-0 text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border font-bold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function JobProgress({ job }: { job: ManualEmailJob }) {
  const pct =
    job.totalRecipients > 0
      ? Math.min(
          100,
          Math.round(((job.sentCount + job.failedCount) / job.totalRecipients) * 100)
        )
      : 0;
  return (
    <div className="p-4 rounded-lg bg-black/30 border border-white/5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {job.sentCount + job.failedCount}/{job.totalRecipients} processed
        </span>
        <StatusPill status={job.status} />
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-rose-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {job.sentCount} sent
        {job.failedCount > 0 ? `, ${job.failedCount} failed` : ""}
      </div>
      {job.error && <div className="text-xs text-rose-400">{job.error}</div>}
    </div>
  );
}
