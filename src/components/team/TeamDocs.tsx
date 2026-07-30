"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Markdown from "react-markdown";
import { FileText, Plus, Pin, PinOff, Trash2, Clock, Eye, Edit3 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { type TeamDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamDocsProps {
  teamId: string;
  currentUser: string | null;
  userRole: string | null;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "sop", label: "SOPs" },
  { value: "project_brief", label: "Project Briefs" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-slate-100 text-slate-600",
  meeting_notes: "bg-blue-100 text-blue-600",
  sop: "bg-amber-100 text-amber-600",
  project_brief: "bg-green-100 text-green-600",
};

export default function TeamDocs({ teamId, currentUser, userRole }: TeamDocsProps) {
  const [docs, setDocs] = useState<TeamDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TeamDoc | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docCategory, setDocCategory] = useState<TeamDoc["category"]>("general");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [docTab, setDocTab] = useState<"edit" | "preview">("edit");
  const supabase = createClient();

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("team_docs")
      .select("*")
      .eq("team_id", teamId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (data) setDocs(data);
    setLoading(false);
  }, [teamId, supabase]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  async function handleSave() {
    if (!docTitle.trim()) return;
    setSaving(true);

    if (editingDoc) {
      const { error } = await supabase
        .from("team_docs")
        .update({ title: docTitle.trim(), content: docContent, category: docCategory, updated_at: new Date().toISOString() })
        .eq("id", editingDoc.id);
      if (!error) {
        setDocs(docs.map((d) => d.id === editingDoc.id ? { ...d, title: docTitle.trim(), content: docContent, category: docCategory, updated_at: new Date().toISOString() } : d));
      }
    } else {
      const { data, error } = await supabase
        .from("team_docs")
        .insert({
          team_id: teamId,
          title: docTitle.trim(),
          content: docContent,
          category: docCategory,
          created_by: currentUser,
        })
        .select()
        .single();
      if (data && !error) {
        setDocs([data, ...docs]);
      }
    }

    setShowCreate(false);
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
    setDocCategory("general");
    setSaving(false);
  }

  async function handleTogglePin(doc: TeamDoc) {
    await supabase.from("team_docs").update({ pinned: !doc.pinned }).eq("id", doc.id);
    setDocs(docs.map((d) => d.id === doc.id ? { ...d, pinned: !d.pinned } : d));
  }

  async function handleDelete(docId: string) {
    await supabase.from("team_docs").delete().eq("id", docId);
    setDocs(docs.filter((d) => d.id !== docId));
  }

  function openEdit(doc: TeamDoc) {
    setEditingDoc(doc);
    setDocTitle(doc.title);
    setDocContent(doc.content);
    setDocCategory(doc.category);
    setDocTab("edit");
    setShowCreate(true);
  }

  function openCreate() {
    setEditingDoc(null);
    setDocTitle("");
    setDocContent("");
    setDocCategory("general");
    setDocTab("edit");
    setShowCreate(true);
  }

  const filteredDocs = filter === "all" ? docs : docs.filter((d) => d.category === filter);
  const pinnedDocs = filteredDocs.filter((d) => d.pinned);
  const unpinnedDocs = filteredDocs.filter((d) => !d.pinned);

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
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setFilter("all")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filter === "all" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filter === cat.value ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={14} />
          New Doc
        </Button>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-3">No docs yet</p>
          <Button onClick={openCreate} size="sm"><Plus size={14} /> Create Doc</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {pinnedDocs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pinned</h4>
              <div className="space-y-2">
                {pinnedDocs.map((doc) => (
                  <DocCard key={doc.id} doc={doc} onEdit={openEdit} onPin={handleTogglePin} onDelete={handleDelete} canManage={userRole === "owner" || userRole === "admin"} />
                ))}
              </div>
            </div>
          )}
          {unpinnedDocs.length > 0 && (
            <div>
              {pinnedDocs.length > 0 && <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">All Docs</h4>}
              <div className="space-y-2">
                {unpinnedDocs.map((doc) => (
                  <DocCard key={doc.id} doc={doc} onEdit={openEdit} onPin={handleTogglePin} onDelete={handleDelete} canManage={userRole === "owner" || userRole === "admin"} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingDoc(null); }} title={editingDoc ? "Edit Doc" : "New Doc"}>
        <div className="space-y-4">
          <Input label="Title" placeholder="Document title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Category</label>
            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value as TeamDoc["category"])} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50">
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Content</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => setDocTab("edit")} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${docTab === "edit" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
                  <Edit3 size={10} /> Edit
                </button>
                <button onClick={() => setDocTab("preview")} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${docTab === "preview" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
                  <Eye size={10} /> Preview
                </button>
              </div>
            </div>
            {docTab === "edit" ? (
              <textarea
                placeholder="Write your document content here... (Markdown supported: **bold**, *italic*, # headings, - lists, `code`)"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none font-mono"
                rows={14}
              />
            ) : (
              <div className="min-h-[200px] max-h-[352px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 prose prose-sm prose-slate max-w-none">
                {docContent ? (
                  <Markdown>{docContent}</Markdown>
                ) : (
                  <p className="text-slate-400 italic">Nothing to preview</p>
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
    </div>
  );
}

function DocCard({ doc, onEdit, onPin, onDelete, canManage }: { doc: TeamDoc; onEdit: (d: TeamDoc) => void; onPin: (d: TeamDoc) => void; onDelete: (id: string) => void; canManage: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(doc)}>
          <div className="flex items-center gap-2 mb-1">
            {doc.pinned && <Pin size={12} className="text-indigo-500 shrink-0" />}
            <h4 className="font-medium text-slate-900 truncate">{doc.title}</h4>
            <Badge className={cn("text-[10px]", CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.general)}>
              {CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
            </Badge>
          </div>
          {doc.content && (
            <div className="text-sm text-slate-500 line-clamp-2 prose prose-sm prose-slate max-w-none">
              <Markdown>{doc.content.length > 200 ? doc.content.slice(0, 200) + "..." : doc.content}</Markdown>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
            <Clock size={10} />
            Updated {new Date(doc.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onPin(doc)} className="p-1 rounded text-slate-400 hover:text-accent hover:bg-indigo-50" title={doc.pinned ? "Unpin" : "Pin"}>
              {doc.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <button onClick={() => onDelete(doc.id)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
