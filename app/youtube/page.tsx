"use client";

import { useState, useEffect, useMemo } from "react";
import AuthGuard from "../components/AuthGuard";
import Link from "next/link";
import { API_BASE_URL } from "../config";

interface YoutubeVideo {
  _id: string;
  title: string;
  youtubeUrl: string;
  videoId: string;
  description?: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// Extract YouTube video ID from URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export default function YoutubePage() {
  return (
    <AuthGuard>
      <YoutubePageContent />
    </AuthGuard>
  );
}

function YoutubePageContent() {
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [description, setDescription] = useState("");

  // Preview state
  const previewVideoId = useMemo(
    () => extractVideoId(youtubeUrl),
    [youtubeUrl]
  );

  const getAuthToken = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("admin_token");
    }
    return null;
  };

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/youtube/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch videos");
      }

      const data = await response.json();
      if (data.success) {
        setVideos(data.videos);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch videos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !youtubeUrl.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const token = getAuthToken();

      const response = await fetch(`${API_BASE_URL}/youtube`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, youtubeUrl, description }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add video");
      }

      // Reset form and refresh list
      setTitle("");
      setYoutubeUrl("");
      setDescription("");
      fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add video");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/youtube/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete video");
      }

      fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete video");
    }
  };

  const handleToggleActive = async (video: YoutubeVideo) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/youtube/${video._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !video.isActive }),
      });

      if (!response.ok) {
        throw new Error("Failed to update video");
      }

      fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update video");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-white/20">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/10 pb-8">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white mb-2 inline-flex items-center gap-2 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-transparent">
              YouTube Videos
            </h1>
            <p className="text-gray-400 text-lg font-light tracking-wide">
              Manage video content for users
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
            {error}
          </div>
        )}

        {/* Add Video Form */}
        <div className="rounded-3xl bg-zinc-900/50 border border-white/5 p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <span className="text-2xl">📺</span>
            Add New Video
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Video Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title..."
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube URL *
                  </label>
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the video..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !youtubeUrl.trim()}
                  className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg hover:from-red-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Adding...
                    </span>
                  ) : (
                    "Add Video"
                  )}
                </button>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Preview
                </label>
                <div className="aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/10">
                  {previewVideoId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${previewVideoId}`}
                      title="YouTube video preview"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <span className="text-4xl mb-2 block">🎬</span>
                        <p>Enter a YouTube URL to see preview</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Videos List */}
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-8 w-1 bg-red-500 rounded-full"></div>
            <h2 className="text-2xl font-bold">Existing Videos</h2>
            <span className="px-3 py-1 rounded-full bg-white/5 text-sm text-gray-400">
              {videos.length} videos
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-12 h-12 rounded-full border-t-2 border-b-2 border-red-500 animate-spin"></div>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed">
              <span className="text-5xl mb-4 block">📭</span>
              <p className="text-gray-500">No videos added yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div
                  key={video._id}
                  className={`rounded-2xl bg-zinc-900/50 border overflow-hidden transition-all duration-300 hover:border-white/20 ${
                    video.isActive
                      ? "border-white/10"
                      : "border-yellow-500/20 opacity-60"
                  }`}
                >
                  <div className="aspect-video relative">
                    <iframe
                      src={`https://www.youtube.com/embed/${video.videoId}`}
                      title={video.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    {!video.isActive && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium border border-yellow-500/30">
                        Hidden
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-1 truncate">
                      {video.title}
                    </h3>
                    {video.description && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                        {video.description}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(video)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          video.isActive
                            ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                            : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        }`}
                      >
                        {video.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => handleDelete(video._id)}
                        className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
