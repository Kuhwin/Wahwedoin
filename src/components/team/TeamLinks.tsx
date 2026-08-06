"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Link2, Plus, Trash2, ExternalLink, Folder, GitBranch, Palette, BookOpen, Wrench, Globe } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { type TeamLink } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamLinksProps {
  teamId: string;
  currentUser: string | null;
  userRole: string | null;
}

const CATEGORIES = [
  { value: "drive", label: "Drive", icon: Folder },
  { value: "repo", label: "Repos", icon: GitBranch },
  { value: "design", label: "Design", icon: Palette },
  { value: "reference", label: "Reference", icon: BookOpen },
  { value: "tool", label: "Tools", icon: Wrench },
  { value: "other", label: "Other", icon: Globe },
] as const;

function detectCategory(url: string): TeamLink["category"] {
  const u = url.toLowerCase();
  if (u.includes("drive.google.com") || u.includes("docs.google.com") || u.includes("sheets.google.com") || u.includes("slides.google.com")) return "drive";
  if (u.includes("github.com") || u.includes("gitlab.com") || u.includes("bitbucket.org")) return "repo";
  if (u.includes("figma.com") || u.includes("canva.com") || u.includes("adobe.com") || u.includes("dribbble.com")) return "design";
  return "other";
}

function getUrlIcon(url: string) {
  const u = url.toLowerCase();
  if (u.includes("drive.google.com")) return { icon: "G", color: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/50", label: "Google Drive" };
  if (u.includes("docs.google.com")) return { icon: "G", color: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/50", label: "Google Docs" };
  if (u.includes("sheets.google.com")) return { icon: "G", color: "text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-900/50", label: "Google Sheets" };
  if (u.includes("meet.google.com")) return { icon: "M", color: "text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-900/50", label: "Google Meet" };
  if (u.includes("youtube.com") || u.includes("youtu.be")) return { icon: "Y", color: "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/50", label: "YouTube" };
  if (u.includes("github.com")) return { icon: "GH", color: "text-slate-800 bg-slate-100 dark:text-slate-300 dark:bg-slate-700", label: "GitHub" };
  if (u.includes("figma.com")) return { icon: "F", color: "text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/50", label: "Figma" };
  if (u.includes("notion.so") || u.includes("notion.site")) return { icon: "N", color: "text-slate-800 bg-slate-100 dark:text-slate-300 dark:bg-slate-700", label: "Notion" };
  if (u.includes("trello.com")) return { icon: "T", color: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/50", label: "Trello" };
  if (u.includes("slack.com")) return { icon: "S", color: "text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/50", label: "Slack" };
  if (u.includes("discord.com") || u.includes("discord.gg")) return { icon: "D", color: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/50", label: "Discord" };
  return null;
}

export default function TeamLinks({ teamId, currentUser, userRole }: TeamLinksProps) {
  const [links, setLinks] = useState<TeamLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCategory, setNewCategory] = useState<TeamLink["category"]>("other");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const supabase = createClient();

  const loadLinks = useCallback(async () => {
    const { data } = await supabase
      .from("team_links")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (data) setLinks(data);
    setLoading(false);
  }, [teamId, supabase]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  function handleUrlChange(url: string) {
    setNewUrl(url);
    if (url && !newName.trim()) {
      try {
        const hostname = new URL(url).hostname.replace("www.", "");
        setNewName(hostname);
      } catch {
        // invalid URL, ignore
      }
    }
    if (url) {
      setNewCategory(detectCategory(url));
    }
  }

  async function handleCreate() {
    if (!newUrl.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("team_links")
      .insert({
        team_id: teamId,
        name: newName.trim() || new URL(newUrl).hostname,
        url: newUrl.trim(),
        category: newCategory,
        added_by: currentUser,
      })
      .select()
      .single();

    if (data && !error) {
      setLinks([data, ...links]);
      setShowCreate(false);
      setNewName("");
      setNewUrl("");
      setNewCategory("other");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("team_links").delete().eq("id", id);
    setLinks(links.filter((l) => l.id !== id));
  }

  const filteredLinks = filter === "all" ? links : links.filter((l) => l.category === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap", filter === "all" ? "bg-white dark:bg-accent shadow-sm text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}
          >
            All ({links.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = links.filter((l) => l.category === cat.value).length;
            if (count === 0 && filter !== cat.value) return null;
            return (
              <button
                key={cat.value}
                onClick={() => setFilter(cat.value)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap", filter === cat.value ? "bg-white dark:bg-accent shadow-sm text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} />
          Add Link
        </Button>
      </div>

      {filteredLinks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <Link2 size={40} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No links yet</p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} /> Add Link</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredLinks.map((link) => {
            const urlInfo = getUrlIcon(link.url);
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-sm transition-all group block"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", urlInfo?.color || "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-700")}>
                    {urlInfo?.icon || link.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-accent transition-colors">{link.name}</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{link.url}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium">
                        {CATEGORIES.find((c) => c.value === link.category)?.label || link.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ExternalLink size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
                    {(userRole === "owner" || userRole === "admin") && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDelete(link.id); }}
                        className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Link">
        <div className="space-y-4">
          <Input label="URL" placeholder="https://drive.google.com/..." value={newUrl} onChange={(e) => handleUrlChange(e.target.value)} required />
          <Input label="Name" placeholder="Google Drive" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as TeamLink["category"])} className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50">
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !newUrl.trim()}>
              {saving ? "Adding..." : "Add Link"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
