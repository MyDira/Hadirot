import React, { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { aiIntakeService, type PamphletParseResult } from '@/services/aiIntake';
import { Toast } from '@/components/shared/Toast';

interface IntakeUploadViewProps {
  onParsed: (result: PamphletParseResult) => void;
}

const SOURCES: { value: string; label: string; hint: string }[] = [
  { value: 'luach_hatsibbur', label: 'Luach HaTsibbur', hint: 'Boro Park daily classifieds PDF' },
  { value: 'kol_berama', label: 'Kol Berama', hint: 'Kol Berama classifieds PDF' },
  { value: 'heimish_agent', label: 'Heimish Agent', hint: 'Heimish Agent daily booklet PDF' },
  { value: 'other_pamphlet', label: 'Other Pamphlet', hint: 'Any other community classifieds' },
];

const MAX_FILES = 12;
const ACCEPT = '.pdf,image/*';

export function IntakeUploadView({ onParsed }: IntakeUploadViewProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState('luach_hatsibbur');
  const [typeHint, setTypeHint] = useState<'auto' | 'rental' | 'sale'>('auto');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('image/'),
    );
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES));
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!user?.id || files.length === 0 || busy) return;
    setBusy(true);
    try {
      setStage(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
      const refs = [];
      for (let i = 0; i < files.length; i++) {
        setStage(`Uploading file ${i + 1} of ${files.length}…`);
        refs.push(await aiIntakeService.uploadPamphletFile(files[i], user.id));
      }
      setStage('Planning the read — splitting pages into batches…');
      const result = await aiIntakeService.parsePamphlet(
        { source, type_hint: typeHint, files: refs },
        (done, total) =>
          setStage(
            `Reading listings with AI — batch ${Math.min(done + 1, total)} of ${total} (each takes ~2-3 min; keep this tab open)…`,
          ),
      );
      setFiles([]);
      onParsed(result);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Source */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Publication source</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                source === s.value
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <span className="block text-sm font-medium text-gray-900">{s.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <UploadCloud className="w-8 h-8 mx-auto text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-700">
          Drop the pamphlet PDF or photos here, or click to browse
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDF or images · up to {MAX_FILES} files · scanned/photographed pages are fine
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg"
            >
              {f.type === 'application/pdf' ? (
                <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
              ) : (
                <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
              )}
              <span className="text-sm text-gray-700 truncate flex-1">{f.name}</span>
              <span className="text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="text-gray-400 hover:text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Type hint + submit */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Listings are:</label>
        <select
          value={typeHint}
          onChange={(e) => setTypeHint(e.target.value as typeof typeHint)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <option value="auto">Auto-detect rental / sale</option>
          <option value="rental">All rentals</option>
          <option value="sale">All sales</option>
        </select>

        <button
          onClick={handleSubmit}
          disabled={busy || files.length === 0}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {busy ? 'Working…' : 'Extract listings'}
        </button>
      </div>

      {busy && stage && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {stage}
        </p>
      )}

      <p className="text-xs text-gray-400">
        Extracted listings land in the Review tab as new leads. Nothing is published until you
        approve it after calling the owner.
      </p>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
