"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Settings, Plus, Trash2, GripVertical } from "lucide-react";
import { type CustomField, type TaskFieldValue } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface CustomFieldsPanelProps {
  projectId: string;
  taskId?: string;
  onFieldValuesChange?: (values: Record<string, string>) => void;
}

export default function CustomFieldsPanel({ projectId, taskId, onFieldValuesChange }: CustomFieldsPanelProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showManager, setShowManager] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomField["field_type"]>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const supabase = createClient();

  const loadFields = useCallback(async () => {
    const { data } = await supabase
      .from("custom_fields")
      .select("id, project_id, name, field_type, options, position, created_at")
      .eq("project_id", projectId)
      .order("position");
    if (data) setFields(data as CustomField[]);
  }, [supabase, projectId]);

  const loadFieldValues = useCallback(async () => {
    if (!taskId) return;
    const { data } = await supabase
      .from("task_field_values")
      .select("id, task_id, field_id, value, created_at")
      .eq("task_id", taskId);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((v: TaskFieldValue) => { if (v.field_id && v.value) map[v.field_id] = v.value; });
      setFieldValues(map);
      onFieldValuesChange?.(map);
    }
  }, [supabase, taskId, onFieldValuesChange]);

  useEffect(() => { void loadFields(); }, [loadFields]);
  useEffect(() => { void loadFieldValues(); }, [loadFieldValues]);

  async function handleAddField() {
    if (!newFieldName.trim()) return;
    const maxPos = fields.length > 0 ? Math.max(...fields.map((f) => f.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("custom_fields")
      .insert({
        project_id: projectId,
        name: newFieldName.trim(),
        field_type: newFieldType,
        options: newFieldType === "dropdown" ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : [],
        position: maxPos,
      })
      .select()
      .single();
    if (data && !error) {
      setFields([...fields, data as CustomField]);
      setNewFieldName("");
      setNewFieldOptions("");
    }
  }

  async function handleDeleteField(fieldId: string) {
    await supabase.from("custom_fields").delete().eq("id", fieldId);
    setFields(fields.filter((f) => f.id !== fieldId));
  }

  async function handleValueChange(fieldId: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    if (!taskId) return;
    await supabase
      .from("task_field_values")
      .upsert({ task_id: taskId, field_id: fieldId, value: value || null }, { onConflict: "task_id,field_id" });
    onFieldValuesChange?.({ ...fieldValues, [fieldId]: value });
  }

  if (!taskId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Custom Fields</h3>
          </div>
          <button
            onClick={() => setShowManager(!showManager)}
            className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
          >
            {showManager ? "Done" : "Manage"}
          </button>
        </div>

        {showManager && (
          <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {fields.map((field) => (
              <div key={field.id} className="flex items-center gap-2">
                <GripVertical size={12} className="text-slate-300 dark:text-slate-600" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{field.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded">{field.field_type}</span>
                <button onClick={() => void handleDeleteField(field.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Input
                placeholder="Field name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                className="flex-1 min-w-[120px]"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as CustomField["field_type"])}
                className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
              </select>
              {newFieldType === "dropdown" && (
                <Input
                  placeholder="Option1, Option2..."
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  className="flex-1 min-w-[150px]"
                />
              )}
              <Button size="sm" onClick={() => void handleAddField()} disabled={!newFieldName.trim()}>
                <Plus size={12} /> Add
              </Button>
            </div>
          </div>
        )}

        {!showManager && fields.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">No custom fields yet. Click &ldquo;Manage&rdquo; to add some.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{field.name}</label>
          {field.field_type === "text" && (
            <input
              value={fieldValues[field.id] || ""}
              onChange={(e) => void handleValueChange(field.id, e.target.value)}
              placeholder={`Enter ${field.name}...`}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          )}
          {field.field_type === "number" && (
            <input
              type="number"
              value={fieldValues[field.id] || ""}
              onChange={(e) => void handleValueChange(field.id, e.target.value)}
              placeholder="0"
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          )}
          {field.field_type === "date" && (
            <input
              type="date"
              value={fieldValues[field.id] || ""}
              onChange={(e) => void handleValueChange(field.id, e.target.value)}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          )}
          {field.field_type === "dropdown" && (
            <select
              value={fieldValues[field.id] || ""}
              onChange={(e) => void handleValueChange(field.id, e.target.value)}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">Select...</option>
              {(field.options || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
