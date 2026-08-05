"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Markdown from "react-markdown";
import { FileText, Plus, Trash2, Clock, Edit3, Eye, ExternalLink, Loader2, MessageSquareText, RefreshCw, FileSpreadsheet, Presentation, FileImage, File } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import DrivePicker from "@/components/team/DrivePicker";
import { syncTeamDocuments, upsertTeamDocuments } from "@/lib/teamDocuments";
import { syncTaskCommentDocs } from "@/lib/taskCommentDocs";
import { fetchDriveFileBlob } from "@/lib/linkedAccounts";
import { type TeamDoc, type TeamDocument, type TeamDocumentSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamDocsProps {
  teamId: string;
  currentUser: string | null;
  userRole: string | null;
}

const FILE_TYPES = [
  { value: "all", label: "All" },
  { value: "docs", label: "Docs" },
  { value: "sheets", label: "Sheets" },
  { value: "slides", label: "Slides" },
  { value: "forms", label: "Forms" },
  { value: "pdfs", label: "PDFs" },
  { value: "images", label: "Images" },
  { value: "other", label: "Other" },
] as const;

type FileType = Exclude<(typeof FILE_TYPES)[number]["value"], "all">;

const FILE_TYPE_CLASSES: Record<FileType, string> = {
  docs: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300",
  sheets: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300",
  slides: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-300",
  forms: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300",
  pdfs: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300",
  images: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function getFileType(doc: TeamDocument): FileType {
  const mime = doc.mime_type || "";
  if (mime.startsWith("image/")) return "images";
  if (mime.includes("pdf")) return "pdfs";
  if (mime.includes("spreadsheet") || mime.includes("sheet")) return "sheets";
  if (mime.includes("presentation")) return "slides";
  if (mime.includes("form")) return "forms";
  if (
    !mime ||
    mime.startsWith("application/vnd.google-apps.") ||
    mime.startsWith("text/") ||
    mime.includes("document") ||
    mime.includes("msword")
  ) {
    return "docs";
  }
  return "other";
}

function friendlyMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("spreadsheet") || m.includes("sheet")) return "Spreadsheet";
  if (m.includes("presentation")) return "Presentation";
  if (m.includes("document")) return "Document";
  if (m.includes("form")) return "Form";
  if (m.includes("pdf")) return "PDF";
  if (m.startsWith("image/")) return "Image";
  if (m.startsWith("video/")) return "Video";
  if (m.startsWith("audio/")) return "Audio";
  if (m.startsWith("text/")) return "Text";
  return mime.replace(/^application\/|^text\//, "");
}

const SOURCE_BADGES: Record<TeamDocumentSource, { label: string; className: string }> = {
  internal: { label: "Internal", className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  drive_folder_team: { label: "Team Drive", className: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300" },
  drive_folder_project: { label: "Project Drive", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300" },
  task_comment: { label: "Task comment", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" },
  drive_picker: { label: "Google Drive", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
};

function getFileIcon(doc: TeamDocument) {
  switch (getFileType(doc)) {
    case "sheets":
      return <FileSpreadsheet size={18} className="text-green-500" />;
    case "slides":
      return <Presentation size={18} className="text-orange-500" />;
    case "pdfs":
      return <FileText size={18} className="text-red-500" />;
    case "images":
      return <FileImage size={18} className="text-cyan-500" />;
    case "other":
      return <File size={18} className="text-slate-500" />;
    default:
      return <FileText size={18} className="text-blue-500" />;
  }
}

export default function TeamDocs({ teamId, currentUser, userRole }: TeamDocsProps) {
  const [docs, setDocs] = useState<TeamDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TeamDoc | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [docTab, setDocTab] = useState<"edit" | "preview">("edit");
  const [showPicker, setShowPicker] = useState(false);
  const [viewDoc, setViewDoc] = useState<TeamDocument | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewKind, setViewKind] = useState<"pdf" | "image" | "other" | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const { addToast } = useToast();
  const supabase = createClient();

  const canManage = userRole === "owner" || userRole === "admin";

  // Fetch the Drive file's content (via the user's own OAuth token) when a
  // doc preview opens, so restricted files render in-app without sharing
  // changes. Google-native files are exported to PDF.
  useEffect(() => {
    if (!viewDoc || !viewDoc.drive_file_id) {
      setViewUrl(null);
      setViewKind(null);
      setViewLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setViewLoading(true);
    setViewUrl(null);
    setViewKind(null);
    void fetchDriveFileBlob(viewDoc.drive_file_id, viewDoc.mime_type).then((result) => {
      if (cancelled || !result) return;
      objectUrl = URL.createObjectURL(result.blob);
      setViewUrl(objectUrl);
      setViewKind(result.kind);
      setViewLoading(false);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [viewDoc]);

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("team_documents")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (data) {
      setDocs((data ?? []) as TeamDocument[]);
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
        .update({ title: docTitle.trim(), content: docContent, updated_at: new Date().toISOString() })
        .eq("id", editingDoc.id);
      if (error) addToast(error.message || "Failed to update doc", "error");
    } else {
      const { data, error } = await supabase
        .from("team_docs")
        .insert({ team_id: teamId, title: docTitle.trim(), content: docContent, created_by: currentUser })
        .select()
        .single();
      if (error) addToast(error.message || "Failed to create doc", "error");
      else void data;
    }

    setShowCreate(false);
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
    setSaving(false);

    // Mirror internal docs into team_documents without touching Drive.
    await mirrorInternalDocs();
    await loadDocs();
  }

  function openCreate() {
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
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
    setDocTab("edit");
    setShowCreate(true);
  }

  async function handleDelete(doc: TeamDocument) {
    if (doc.source === "drive_folder_team" || doc.source === "drive_folder_project") {
      addToast("Folder documents are managed by the Drive sync", "info");
      return;
    }
    if (!window.confirm(`Remove "${doc.title}" from the team files?`)) return;
    const { error } = await supabase.from("team_documents").delete().eq("id", doc.id);
    if (error) {
      addToast(error.message || "Failed to remove file", "error");
      return;
    }
    setDocs(docs.filter((d) => d.id !== doc.id));
  }

  function openDoc(doc: TeamDocument) {
    if (doc.source === "internal") {
      void openEdit(doc);
      return;
    }
    setViewDoc(doc);
  }

  const filteredDocs = filter === "all" ? docs : docs.filter((d) => getFileType(d) === filter);

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
          {FILE_TYPES.map((cat) => (
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
            New Note
          </Button>
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <FileText size={40} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No files here yet</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={openCreate} size="sm"><Plus size={14} /> New Note</Button>
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
              canManage={canManage}
              canManageOwn={!!currentUser && doc.added_by === currentUser}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingDoc(null); }} title={editingDoc ? "Edit Note" : "New Note"}>
        <div className="space-y-4">
          <Input label="Title" placeholder="Note title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required />
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
              {saving ? "Saving..." : editingDoc ? "Save Changes" : "Create Note"}
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
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {viewLoading ? "Loading preview..." : viewKind ? "Preview" : "Preview unavailable"}
              </p>
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
            {viewLoading ? (
              <div className="flex items-center justify-center h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            ) : viewUrl && viewKind === "pdf" ? (
              <iframe
                src={viewUrl}
                className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700"
                title={viewDoc.title}
              />
            ) : viewUrl && viewKind === "image" ? (
              <div className="flex items-center justify-center h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs can't use next/image */}
                <img src={viewUrl} alt={viewDoc.title} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  This file type can&apos;t be previewed here. Open it in Google Drive instead.
                </p>
                {viewDoc.web_view_link && (
                  <a
                    href={viewDoc.web_view_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <ExternalLink size={14} /> Open in Google Drive
                  </a>
                )}
              </div>
            )}
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
  canManage,
  canManageOwn,
}: {
  doc: TeamDocument;
  onOpen: (doc: TeamDocument) => void;
  onDelete: (doc: TeamDocument) => void;
  canManage: boolean;
  canManageOwn: boolean;
}) {
  const isInternal = doc.source === "internal";
  const canModify = canManage || canManageOwn;
  const badge = SOURCE_BADGES[doc.source];
  const canDelete = !(doc.source === "drive_folder_team" || doc.source === "drive_folder_project");
  const type = getFileType(doc);

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
              <Badge className={cn("text-[10px]", FILE_TYPE_CLASSES[type])}>
                {FILE_TYPES.find((t) => t.value === type)?.label || type}
              </Badge>
              {doc.project_id && (
                <span className="text-[10px] text-slate-400 uppercase font-medium">Project doc</span>
              )}
            </div>
            {doc.mime_type && (
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{friendlyMime(doc.mime_type)}</p>
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
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
                  className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors"
                  title={doc.source === "internal" ? "Delete" : "Remove from files"}
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
