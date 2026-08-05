"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Markdown from "react-markdown";
import { FileText, Plus, Trash2, Clock, Edit3, Eye, ExternalLink, Loader2, MessageSquareText, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import DrivePicker from "@/components/team/DrivePicker";
import { syncTeamDocuments, upsertTeamDocuments } from "@/lib/teamDocuments";
import { syncTaskCommentDocs } from "@/lib/taskCommentDocs";
import { type TeamDoc, type TeamDocument, type TeamDocumentSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamDocsProps {
  teamId: string;
  currentUser: string | null;
  userRole: string | null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "sops", label: "SOPs" },
  { value: "project_briefs", label: "Project Briefs" },
] as const;

const INTERNAL_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "sop", label: "SOPs" },
  { value: "project_brief", label: "Project Briefs" },
] as const;

const CATEGORY_CLASSES: Record<string, string> = {
  general: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  meeting_notes: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300",
  sops: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300",
  project_briefs: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300",
};

const SOURCE_BADGES: Record<TeamDocumentSource, { label: string; className: string }> = {
  internal: { label: "Internal", className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  drive_folder_team: { label: "Team Drive", className: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300" },
  drive_folder_project: { label: "Project Drive", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300" },
  task_comment: { label: "Task comment", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" },
  drive_picker: { label: "Google Drive", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
};

function getFileIcon(doc: TeamDocument) {
  const mime = doc.mime_type || "";
  if (mime.includes("spreadsheet")) return <FileText size={18} className="text-green-500" />;
  if (mime.includes("presentation")) return <FileText size={18} className="text-orange-500" />;
  if (mime.includes("pdf")) return <FileText size={18} className="text-red-500" />;
  if (mime.includes("folder")) return <FileText size={18} className="text-amber-500" />;
  return <FileText size={18} className="text-blue-500" />;
}

function toInternalCategory(category: string): TeamDoc["category"] {
  if (category === "sops") return "sop";
  if (category === "project_briefs") return "project_brief";
  return category as TeamDoc["category"];
}

export default function TeamDocs({ teamId, currentUser, userRole }: TeamDocsProps) {
  const [docs, setDocs] = useState<TeamDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TeamDoc | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docCategory, setDocCategory] = useState<TeamDoc["category"]>("general");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [docTab, setDocTab] = useState<"edit" | "preview">("edit");
  const [showPicker, setShowPicker] = useState(false);
  const [viewDoc, setViewDoc] = useState<TeamDocument | null>(null);
  const { addToast } = useToast();
  const supabase = createClient();

  const canManage = userRole === "owner" || userRole === "admin";

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("team_documents")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (data) {
      setDocs((data as Array<Omit<TeamDocument, "category"> & { category: string }>).map((d) => ({
        ...d,
        category: d.category as TeamDocument["category"],
      })));
    }
    setLoading(false);
  }, [teamId, supabase]);

  const mirrorInternalDocs = useCallback(async () => {
    await upsertTeamDocuments(teamId, [], false);
  }, [teamId]);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await syncTeamDocuments(teamId);
      await syncTaskCommentDocs(teamId);
    } finally {
      setSyncing(false);
      await loadDocs();
    }
  }, [teamId, loadDocs]);

  useEffect(() => {
    void syncAll();
  }, [syncAll]);

  // Live refresh: internal docs (team_docs) and the unified list
  // (team_documents) both reload on any change.
  useEffect(() => {
    const channel = supabase
      .channel(`team-docs-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_documents" }, () => {
        void loadDocs();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_docs" }, () => {
        void loadDocs();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId, supabase, loadDocs]);

  async function handleSave() {
    if (!docTitle.trim()) return;
    setSaving(true);

    if (editingDoc) {
      const { error } = await supabase
        .from("team_docs")
        .update({ title: docTitle.trim(), content: docContent, category: docCategory, updated_at: new Date().toISOString() })
        .eq("id", editingDoc.id);
      if (error) addToast(error.message || "Failed to update doc", "error");
    } else {
      const { data, error } = await supabase
        .from("team_docs")
        .insert({ team_id: teamId, title: docTitle.trim(), content: docContent, category: docCategory, created_by: currentUser })
        .select()
        .single();
      if (error) addToast(error.message || "Failed to create doc", "error");
      else void data;
    }

    setShowCreate(false);
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
    setDocCategory("general");
    setSaving(false);

    // Mirror internal docs into team_documents without touching Drive.
    await mirrorInternalDocs();
    await loadDocs();
  }

  function openCreate() {
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
    setDocCategory("general");
    setDocTab("edit");
    setShowCreate(true);
  }

  async function openEdit(doc: TeamDocument) {
    if (doc.source !== "internal" || !doc.internal_doc_id) return;
    const { data } = await supabase
      .from("team_docs")
      .select("id, team_id, title, content, category, pinned, created_by, created_at, updated_at")
      .eq("id", doc.internal_doc_id)
      .single();
    if (!data) return;
    setEditingDoc(data as TeamDoc);
    setDocTitle(data.title);
    setDocContent(data.content);
    setDocCategory(data.category);
    setDocTab("edit");
    setShowCreate(true);
  }

  async function handleDelete(doc: TeamDocument) {
    if (doc.source === "drive_folder_team" || doc.source === "drive_folder_project") {
      addToast("Folder documents are managed by the Drive sync", "info");
      return;
    }
    if (!window.confirm(`Remove "${doc.title}" from the team docs?`)) return;
    const { error } = await supabase.from("team_documents").delete().eq("id", doc.id);
    if (error) {
      addToast(error.message || "Failed to remove doc", "error");
      return;
    }
    setDocs(docs.filter((d) => d.id !== doc.id));
  }

  async function handleCategory(doc: TeamDocument, category: string) {
    if (doc.source === "internal" && doc.internal_doc_id) {
      const { error } = await supabase
        .from("team_docs")
        .update({ category: toInternalCategory(category) })
        .eq("id", doc.internal_doc_id);
      if (error) {
        addToast(error.message || "Failed to update category", "error");
        return;
      }
      await mirrorInternalDocs();
      await loadDocs();
      return;
    }
    const { error } = await supabase.from("team_documents").update({ category }).eq("id", doc.id);
    if (error) {
      addToast(error.message || "Failed to update category", "error");
      return;
    }
    setDocs(docs.map((d) => (d.id === doc.id ? { ...d, category: category as TeamDocument["category"] } : d)));
  }

  function openDoc(doc: TeamDocument) {
    if (doc.source === "internal") {
      void openEdit(doc);
      return;
    }
    setViewDoc(doc);
  }

  const filteredDocs = filter === "all" ? docs : docs.filter((d) => d.category === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto">
          {FILTERS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap", filter === cat.value ? "bg-white dark:bg-accent shadow-sm text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {syncing && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Syncing Drive...
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={() => void syncAll()} disabled={syncing} title="Re-sync from Google Drive">
            <RefreshCw size={13} />
            Sync
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
            <Plus size={14} />
            Add from Google Drive
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus size={14} />
            New Doc
          </Button>
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <FileText size={40} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No docs here yet</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={openCreate} size="sm"><Plus size={14} /> Create Doc</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}><Plus size={14} /> Add from Google Drive</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onOpen={openDoc}
              onDelete={handleDelete}
              onCategory={handleCategory}
              canManage={canManage}
              canManageOwn={!!currentUser && doc.added_by === currentUser}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingDoc(null); }} title={editingDoc ? "Edit Doc" : "New Doc"}>
        <div className="space-y-4">
          <Input label="Title" placeholder="Document title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value as TeamDoc["category"])} className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50">
              {INTERNAL_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Content</label>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button onClick={() => setDocTab("edit")} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${docTab === "edit" ? "bg-white dark:bg-accent shadow-sm text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                  <Edit3 size={10} /> Edit
                </button>
                <button onClick={() => setDocTab("preview")} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${docTab === "preview" ? "bg-white dark:bg-accent shadow-sm text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                  <Eye size={10} /> Preview
                </button>
              </div>
            </div>
            {docTab === "edit" ? (
              <textarea
                placeholder="Write your document content here... (Markdown supported: **bold**, *italic*, # headings, - lists, `code`)"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none font-mono"
                rows={14}
              />
            ) : (
              <div className="min-h-[200px] max-h-[352px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 prose prose-sm prose-slate dark:prose-invert max-w-none">
                {docContent ? (
                  <Markdown>{docContent}</Markdown>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic">Nothing to preview</p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditingDoc(null); }}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving || !docTitle.trim()}>
              {saving ? "Saving..." : editingDoc ? "Save Changes" : "Create Doc"}
            </Button>
          </div>
        </div>
      </Modal>

      <DrivePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        teamId={teamId}
        onAdded={() => void loadDocs()}
      />

      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.title || "Document"} size="lg">
        {viewDoc?.drive_file_id ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">Preview via Google Drive</p>
              {viewDoc.web_view_link && (
                <a
                  href={viewDoc.web_view_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline shrink-0"
                >
                  <ExternalLink size={12} /> Open in Google Drive
                </a>
              )}
            </div>
            <iframe
              src={`https://drive.google.com/file/d/${viewDoc.drive_file_id}/preview`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700"
              title={viewDoc.title}
              allowFullScreen
            />
          </div>
        ) : viewDoc?.web_view_link ? (
          <div className="text-center py-10">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This document cannot be embedded. Open it in Google Drive instead.</p>
            <a
              href={viewDoc.web_view_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <ExternalLink size={14} /> Open in Google Drive
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function DocCard({
  doc,
  onOpen,
  onDelete,
  onCategory,
  canManage,
  canManageOwn,
}: {
  doc: TeamDocument;
  onOpen: (doc: TeamDocument) => void;
  onDelete: (doc: TeamDocument) => void;
  onCategory: (doc: TeamDocument, category: string) => void;
  canManage: boolean;
  canManageOwn: boolean;
}) {
  const isInternal = doc.source === "internal";
  const canModify = canManage || canManageOwn;
  const badge = SOURCE_BADGES[doc.source];
  const canDelete = !(doc.source === "drive_folder_team" || doc.source === "drive_folder_project");

  return (
    <div
      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group cursor-pointer"
      onClick={() => onOpen(doc)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-shrink-0 mt-0.5">
            {doc.icon_link ? (
              <Image src={doc.icon_link} alt="" width={18} height={18} className="w-[18px] h-[18px]" unoptimized />
            ) : (
              getFileIcon(doc)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">{doc.title}</h4>
              <Badge className={cn("text-[10px]", badge?.className || "bg-slate-100 text-slate-600")}>
                {doc.source === "task_comment" ? <MessageSquareText size={9} className="inline mr-1" /> : null}
                {badge?.label || doc.source}
              </Badge>
              <Badge className={cn("text-[10px]", CATEGORY_CLASSES[doc.category] || CATEGORY_CLASSES.general)}>
                {FILTERS.find((c) => c.value === doc.category)?.label || doc.category}
              </Badge>
              {doc.project_id && (
                <span className="text-[10px] text-slate-400 uppercase font-medium">Project doc</span>
              )}
            </div>
            {doc.mime_type && (
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.mime_type.replace(/^application\/|^text\//, "")}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1">
              <Clock size={10} />
              Added {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isInternal && doc.web_view_link && (
            <a
              href={doc.web_view_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
              title="Open in Google Drive"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {canModify && (
            <>
              <select
                value={doc.category}
                onChange={(e) => { e.stopPropagation(); onCategory(doc, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                title="Change category"
                className="text-[10px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-1 py-1 outline-none focus:border-accent"
              >
                {FILTERS.filter((c) => c.value !== "all").map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
                  className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors"
                  title={doc.source === "internal" ? "Delete" : "Remove from docs"}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
