'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { templates as templatesApi, templateSequences, media, accounts as accountsApi } from '@/lib/api';
import { Plus, Edit2, Trash2, FileText, Command, Image, Video, Mic, Clock, X, Upload, StopCircle, Loader2, File as FileIcon } from 'lucide-react';

interface Account { id: string; name: string; phone_number: string; status: string; }
interface Template { id: string; name: string; content: string; shortcut?: string; content_type: string; media_url?: string; media_mime_type?: string; whatsapp_account_id?: string; }
interface SequenceItem { id?: string; content_type: string; content?: string; media_url?: string; media_mime_type?: string; delay_min_seconds: number; delay_max_seconds: number; localFile?: globalThis.File; localPreviewUrl?: string; }
interface Sequence { id: string; name: string; description?: string; shortcut?: string; is_active: boolean; items: SequenceItem[]; whatsapp_account_id?: string; }
type ContentType = 'text' | 'image' | 'video' | 'audio' | 'document';
const CONTENT_TYPES: { value: ContentType; label: string; icon: any }[] = [{ value: 'text', label: 'Text', icon: FileText }, { value: 'image', label: 'Image', icon: Image }, { value: 'video', label: 'Video', icon: Video }, { value: 'audio', label: 'Voice', icon: Mic }, { value: 'document', label: 'Document', icon: FileIcon }];

function VoiceRecorder({ onRecordComplete, existingUrl, onClear }: { onRecordComplete: (blob: Blob, duration: number) => void; existingUrl?: string; onClear: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl || null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); if (audioUrl && audioUrl !== existingUrl) URL.revokeObjectURL(audioUrl); }; }, [audioUrl, existingUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType }); const url = URL.createObjectURL(blob); setAudioUrl(url); onRecordComplete(blob, Math.round((Date.now() - startTimeRef.current) / 1000)); stream.getTracks().forEach(track => track.stop()); };
      mediaRecorder.start(100); startTimeRef.current = Date.now(); setIsRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(Math.round((Date.now() - startTimeRef.current) / 1000)), 1000);
    } catch { alert('Could not access microphone'); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } } };
  const handleClear = () => { if (audioUrl && audioUrl !== existingUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(null); setRecordingTime(0); onClear(); };
  const formatTime = (s: number) => { const m = Math.floor(s / 60); return m + ':' + (s % 60).toString().padStart(2, '0'); };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      {audioUrl ? (<div className="space-y-3"><audio controls src={audioUrl} className="w-full h-10" /><button onClick={handleClear} className="text-sm text-red-500 hover:text-red-700 flex items-center space-x-1"><X className="h-4 w-4" /><span>Remove</span></button></div>)
      : isRecording ? (<div className="flex items-center justify-between"><div className="flex items-center space-x-3"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /><span className="text-sm font-medium text-gray-700">Recording... {formatTime(recordingTime)}</span></div><button onClick={stopRecording} className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"><StopCircle className="h-4 w-4" /><span>Stop</span></button></div>)
      : (<button onClick={startRecording} className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-whatsapp-dark hover:bg-green-50"><Mic className="h-5 w-5 text-gray-500" /><span className="text-gray-600">Tap to record</span></button>)}
    </div>
  );
}

function MediaPreview({ url, mimeType, onRemove }: { url: string; mimeType?: string; onRemove: () => void }) {
  const isImage = mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  const isVideo = mimeType?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url);
  const isAudio = mimeType?.startsWith('audio/');
  return (
    <div className="relative border rounded-lg overflow-hidden bg-gray-100">
      {isImage && <img src={url} alt="" className="max-h-40 mx-auto object-contain" />}
      {isVideo && <video controls src={url} className="max-h-40 w-full" />}
      {isAudio && <audio controls src={url} className="w-full p-2" />}
      <button onClick={onRemove} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"><X className="h-4 w-4" /></button>
    </div>
  );
}

function FileUpload({ accept, onFileSelect, isUploading }: { accept: string; onFileSelect: (file: File) => void; isUploading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (<div><input ref={inputRef} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }} className="hidden" /><button onClick={() => inputRef.current?.click()} disabled={isUploading} className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-whatsapp-dark hover:bg-green-50 disabled:opacity-50">{isUploading ? <><Loader2 className="h-5 w-5 text-gray-500 animate-spin" /><span className="text-gray-600">Uploading...</span></> : <><Upload className="h-5 w-5 text-gray-500" /><span className="text-gray-600">Upload file</span></>}</button></div>);
}

export default function TemplatesPage() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'quick' | 'sequences'>('quick');
  const [templatesList, setTemplatesList] = useState<Template[]>([]);
  const [sequencesList, setSequencesList] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [quickForm, setQuickForm] = useState({ name: '', content: '', shortcut: '', content_type: 'text' as ContentType, media_url: '', media_mime_type: '' });
  const [quickLocalFile, setQuickLocalFile] = useState<File | null>(null);
  const [quickPreviewUrl, setQuickPreviewUrl] = useState<string | null>(null);
  const [quickRecordingBlob, setQuickRecordingBlob] = useState<Blob | null>(null);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [sequenceForm, setSequenceForm] = useState({ name: '', description: '', shortcut: '', items: [] as SequenceItem[] });

  // Load accounts first, then templates for selected account
  useEffect(() => { if (token) loadAccounts(); }, [token]);
  useEffect(() => { if (token && selectedAccountId) loadTemplates(); }, [token, selectedAccountId]);

  const loadAccounts = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await accountsApi.list(token);
      setAccounts(res.accounts || []);
      // Auto-select first account
      if (res.accounts?.length > 0 && !selectedAccountId) {
        setSelectedAccountId(res.accounts[0].id);
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    } finally {
      if (!selectedAccountId) setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (!token || !selectedAccountId) return;
    setIsLoading(true);
    try {
      const [t, s] = await Promise.all([
        templatesApi.list(token, selectedAccountId),
        templateSequences.list(token, selectedAccountId).catch(() => ({ sequences: [] }))
      ]);
      setTemplatesList(t.templates);
      setSequencesList(s.sequences || []);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadFile = async (file: File) => { if (!token) return null; setIsUploading(true); try { const r = await media.upload(token, file); return { url: r.url, mimeType: r.mimeType }; } catch { alert('Upload failed'); return null; } finally { setIsUploading(false); } };
  const uploadVoice = async (blob: Blob, dur: number) => { if (!token) return null; setIsUploading(true); try { const r = await media.uploadVoice(token, blob, dur); return { url: r.url, mimeType: r.mimeType }; } catch { alert('Upload failed'); return null; } finally { setIsUploading(false); } };

  const handleOpenQuickModal = (t?: Template) => { if (t) { setEditingTemplate(t); setQuickForm({ name: t.name, content: t.content, shortcut: t.shortcut || '', content_type: (t.content_type || 'text') as ContentType, media_url: t.media_url || '', media_mime_type: t.media_mime_type || '' }); setQuickPreviewUrl(t.media_url || null); } else { setEditingTemplate(null); setQuickForm({ name: '', content: '', shortcut: '', content_type: 'text', media_url: '', media_mime_type: '' }); setQuickPreviewUrl(null); } setQuickLocalFile(null); setQuickRecordingBlob(null); setShowQuickModal(true); };
  const handleQuickFileSelect = (f: File) => { setQuickLocalFile(f); setQuickPreviewUrl(URL.createObjectURL(f)); setQuickForm(p => ({ ...p, media_mime_type: f.type })); };
  const handleQuickRecordComplete = (b: Blob) => { setQuickRecordingBlob(b); setQuickForm(p => ({ ...p, media_mime_type: b.type })); };
  const handleClearQuickMedia = () => { if (quickPreviewUrl && quickLocalFile) URL.revokeObjectURL(quickPreviewUrl); setQuickLocalFile(null); setQuickPreviewUrl(null); setQuickRecordingBlob(null); setQuickForm(p => ({ ...p, media_url: '', media_mime_type: '' })); };

  const handleSaveQuick = async () => { if (!token || !quickForm.name || !selectedAccountId) return; let mUrl = quickForm.media_url, mType = quickForm.media_mime_type; if (quickLocalFile) { const r = await uploadFile(quickLocalFile); if (r) { mUrl = r.url; mType = r.mimeType; } else return; } if (quickRecordingBlob) { const r = await uploadVoice(quickRecordingBlob, 0); if (r) { mUrl = r.url; mType = r.mimeType; } else return; } try { if (editingTemplate) { const { template } = await templatesApi.update(token, editingTemplate.id, { name: quickForm.name, content: quickForm.content, shortcut: quickForm.shortcut || undefined, content_type: quickForm.content_type, media_url: mUrl || undefined, media_mime_type: mType || undefined }); setTemplatesList(p => p.map(x => x.id === template.id ? template : x)); } else { const { template } = await templatesApi.create(token, selectedAccountId, quickForm.name, quickForm.content, quickForm.shortcut || undefined, { content_type: quickForm.content_type, media_url: mUrl || undefined, media_mime_type: mType || undefined }); setTemplatesList(p => [template, ...p]); } setShowQuickModal(false); } catch (e) { console.error(e); } };
  const handleDeleteQuick = async (id: string) => { if (!token || !confirm('Delete?')) return; try { await templatesApi.delete(token, id); setTemplatesList(p => p.filter(x => x.id !== id)); } catch {} };

  const handleOpenSequenceModal = (s?: Sequence) => { if (s) { setEditingSequence(s); setSequenceForm({ name: s.name, description: s.description || '', shortcut: s.shortcut || '', items: s.items?.map(i => ({ ...i })) || [] }); } else { setEditingSequence(null); setSequenceForm({ name: '', description: '', shortcut: '', items: [{ content_type: 'text', content: '', delay_min_seconds: 0, delay_max_seconds: 0 }] }); } setShowSequenceModal(true); };
  const handleAddSequenceItem = () => setSequenceForm(p => ({ ...p, items: [...p.items, { content_type: 'text', content: '', delay_min_seconds: 1, delay_max_seconds: 3 }] }));
  const handleRemoveSequenceItem = (i: number) => { const item = sequenceForm.items[i]; if (item.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl); setSequenceForm(p => ({ ...p, items: p.items.filter((_, j) => j !== i) })); };
  const handleUpdateSequenceItem = (i: number, u: Partial<SequenceItem>) => setSequenceForm(p => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, ...u } : x) }));
  const handleSeqFileSelect = (i: number, f: File) => { handleUpdateSequenceItem(i, { localFile: f, localPreviewUrl: URL.createObjectURL(f), media_mime_type: f.type }); };
  const handleSeqRecordComplete = (i: number, b: Blob) => { handleUpdateSequenceItem(i, { localFile: new File([b], 'voice.webm', { type: b.type }), localPreviewUrl: URL.createObjectURL(b), media_mime_type: b.type }); };
  const handleClearSeqMedia = (i: number) => { const item = sequenceForm.items[i]; if (item.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl); handleUpdateSequenceItem(i, { localFile: undefined, localPreviewUrl: undefined, media_url: '', media_mime_type: '' }); };

  const handleSaveSequence = async () => { if (!token || !sequenceForm.name || !sequenceForm.items.length || !selectedAccountId) return; const items = await Promise.all(sequenceForm.items.map(async (x) => { let mUrl = x.media_url, mType = x.media_mime_type; if (x.localFile) { const r = await uploadFile(x.localFile); if (r) { mUrl = r.url; mType = r.mimeType; } } return { content_type: x.content_type, content: x.content, media_url: mUrl, media_mime_type: mType, delay_min_seconds: x.delay_min_seconds, delay_max_seconds: x.delay_max_seconds }; })); try { if (editingSequence) { const { sequence } = await templateSequences.update(token, editingSequence.id, { name: sequenceForm.name, description: sequenceForm.description || undefined, shortcut: sequenceForm.shortcut || undefined, items }); setSequencesList(p => p.map(x => x.id === sequence.id ? sequence : x)); } else { const { sequence } = await templateSequences.create(token, { accountId: selectedAccountId, name: sequenceForm.name, description: sequenceForm.description || undefined, shortcut: sequenceForm.shortcut || undefined, items }); setSequencesList(p => [sequence, ...p]); } setShowSequenceModal(false); } catch (e) { console.error(e); } };
  const handleDeleteSequence = async (id: string) => { if (!token || !confirm('Delete?')) return; try { await templateSequences.delete(token, id); setSequencesList(p => p.filter(x => x.id !== id)); } catch {} };

  const getIcon = (t: string) => { switch (t) { case 'image': return <Image className="h-4 w-4" />; case 'video': return <Video className="h-4 w-4" />; case 'audio': return <Mic className="h-4 w-4" />; case 'document': return <FileIcon className="h-4 w-4" />; default: return <FileText className="h-4 w-4" />; } };
  const getAccept = (t: string) => { switch (t) { case 'image': return 'image/*'; case 'video': return 'video/*'; case 'audio': return 'audio/*'; case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'; default: return '*/*'; } };

  if (isLoading) return <div className="h-full flex items-center justify-center"><div className="animate-pulse text-gray-500">Loading...</div></div>;

  if (accounts.length === 0) return <div className="h-full flex items-center justify-center"><div className="text-gray-500">No WhatsApp accounts found. Please add an account first.</div></div>;

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-gray-900">Templates</h1><p className="text-gray-500">Shared templates for all agents</p></div>
          {accounts.length > 1 && (
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-sm">
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name || acc.phone_number}</option>)}
            </select>
          )}
        </div>
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
          <button onClick={() => setActiveTab('quick')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${activeTab === 'quick' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>Quick Replies ({templatesList.length})</button>
          <button onClick={() => setActiveTab('sequences')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${activeTab === 'sequences' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>Sequences ({sequencesList.length})</button>
        </div>

        {activeTab === 'quick' && (<><div className="flex justify-end mb-4"><button onClick={() => handleOpenQuickModal()} className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal"><Plus className="h-5 w-5" /><span>New Template</span></button></div>{templatesList.length === 0 ? (<div className="bg-white rounded-lg shadow-sm p-12 text-center"><FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" /><h3 className="text-lg font-medium mb-2">No templates</h3><button onClick={() => handleOpenQuickModal()} className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg"><Plus className="h-5 w-5" /><span>Create</span></button></div>) : (<div className="space-y-3">{templatesList.map((t) => (<div key={t.id} className="bg-white rounded-lg shadow-sm p-4 border"><div className="flex items-start justify-between"><div className="flex-1 min-w-0"><div className="flex items-center space-x-2 flex-wrap gap-1"><h3 className="font-medium text-gray-900">{t.name}</h3>{t.shortcut && <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"><Command className="h-3 w-3 mr-1" />{t.shortcut}</span>}{t.content_type !== 'text' && <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{getIcon(t.content_type)}<span className="ml-1 capitalize">{t.content_type}</span></span>}</div>{t.content && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{t.content}</p>}{t.media_url && <div className="mt-2">{t.content_type === 'image' && <img src={t.media_url} alt="" className="max-h-20 rounded" />}{t.content_type === 'video' && <video src={t.media_url} className="max-h-20 rounded" />}{t.content_type === 'audio' && <audio src={t.media_url} controls className="h-8" />}</div>}</div><div className="flex items-center space-x-1 ml-4"><button onClick={() => handleOpenQuickModal(t)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDeleteQuick(t.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button></div></div></div>))}</div>)}</>)}

        {activeTab === 'sequences' && (<><div className="flex justify-end mb-4"><button onClick={() => handleOpenSequenceModal()} className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal"><Plus className="h-5 w-5" /><span>New Sequence</span></button></div>{sequencesList.length === 0 ? (<div className="bg-white rounded-lg shadow-sm p-12 text-center"><Clock className="h-16 w-16 mx-auto text-gray-300 mb-4" /><h3 className="text-lg font-medium mb-2">No sequences</h3><button onClick={() => handleOpenSequenceModal()} className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg"><Plus className="h-5 w-5" /><span>Create</span></button></div>) : (<div className="space-y-3">{sequencesList.map((s) => (<div key={s.id} className="bg-white rounded-lg shadow-sm p-4 border"><div className="flex items-start justify-between"><div className="flex-1"><div className="flex items-center space-x-2"><h3 className="font-medium text-gray-900">{s.name}</h3><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{s.items?.length || 0} msgs</span>{s.shortcut && <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"><Command className="h-3 w-3 mr-1" />{s.shortcut}</span>}</div>{s.description && <p className="mt-1 text-sm text-gray-500">{s.description}</p>}<div className="mt-3 flex flex-wrap gap-2">{s.items?.slice(0, 5).map((item, i) => <div key={i} className="flex items-center space-x-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{getIcon(item.content_type)}<span className="capitalize">{item.content_type}</span>{item.delay_max_seconds > 0 && <span className="text-gray-400">+{item.delay_min_seconds}-{item.delay_max_seconds}s</span>}</div>)}</div></div><div className="flex items-center space-x-1 ml-4"><button onClick={() => handleOpenSequenceModal(s)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDeleteSequence(s.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button></div></div></div>))}</div>)}</>)}
      </div>

      {showQuickModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"><div className="p-6"><h2 className="text-xl font-bold mb-4">{editingTemplate ? 'Edit' : 'New'} Template</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={quickForm.name} onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })} placeholder="e.g., Welcome" className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Shortcut</label><input type="text" value={quickForm.shortcut} onChange={(e) => setQuickForm({ ...quickForm, shortcut: e.target.value })} placeholder="/welcome" className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><div className="grid grid-cols-4 gap-2">{CONTENT_TYPES.map((t) => <button key={t.value} onClick={() => { handleClearQuickMedia(); setQuickForm({ ...quickForm, content_type: t.value }); }} className={`p-3 rounded-lg border-2 flex flex-col items-center ${quickForm.content_type === t.value ? 'border-whatsapp-dark bg-green-50' : 'border-gray-200'}`}><t.icon className={`h-5 w-5 ${quickForm.content_type === t.value ? 'text-whatsapp-dark' : 'text-gray-500'}`} /><span className="text-xs mt-1">{t.label}</span></button>)}</div></div>{quickForm.content_type !== 'text' && <div><label className="block text-sm font-medium text-gray-700 mb-1">{quickForm.content_type === 'audio' ? 'Voice' : 'Upload'}</label>{(quickPreviewUrl || quickForm.media_url) && <div className="mb-3"><MediaPreview url={quickPreviewUrl || quickForm.media_url} mimeType={quickForm.media_mime_type} onRemove={handleClearQuickMedia} /></div>}{!quickPreviewUrl && !quickForm.media_url && (quickForm.content_type === 'audio' ? <VoiceRecorder onRecordComplete={handleQuickRecordComplete} onClear={handleClearQuickMedia} /> : <FileUpload accept={getAccept(quickForm.content_type)} onFileSelect={handleQuickFileSelect} isUploading={isUploading} />)}</div>}<div><label className="block text-sm font-medium text-gray-700 mb-1">{quickForm.content_type === 'text' ? 'Content' : 'Caption'}</label><textarea value={quickForm.content} onChange={(e) => setQuickForm({ ...quickForm, content: e.target.value })} placeholder={quickForm.content_type === 'text' ? 'Message...' : 'Caption...'} rows={3} className="w-full px-3 py-2 border rounded-lg resize-none" /></div><div className="flex space-x-3 pt-2"><button onClick={() => setShowQuickModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleSaveQuick} disabled={!quickForm.name || (quickForm.content_type === 'text' && !quickForm.content) || isUploading} className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg disabled:opacity-50 flex items-center justify-center space-x-2">{isUploading && <Loader2 className="h-4 w-4 animate-spin" />}<span>{editingTemplate ? 'Save' : 'Create'}</span></button></div></div></div></div></div>)}

      {showSequenceModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"><div className="p-6"><h2 className="text-xl font-bold mb-4">{editingSequence ? 'Edit' : 'New'} Sequence</h2><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={sequenceForm.name} onChange={(e) => setSequenceForm({ ...sequenceForm, name: e.target.value })} placeholder="Onboarding" className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Shortcut</label><input type="text" value={sequenceForm.shortcut} onChange={(e) => setSequenceForm({ ...sequenceForm, shortcut: e.target.value })} placeholder="/onboard" className="w-full px-3 py-2 border rounded-lg" /></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><input type="text" value={sequenceForm.description} onChange={(e) => setSequenceForm({ ...sequenceForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><div className="flex items-center justify-between mb-2"><label className="block text-sm font-medium text-gray-700">Messages</label><button onClick={handleAddSequenceItem} className="text-sm text-whatsapp-dark hover:underline">+ Add</button></div><div className="space-y-3">{sequenceForm.items.map((item, i) => (<div key={i} className="border rounded-lg p-4 bg-gray-50"><div className="flex items-start justify-between mb-3"><span className="text-sm font-medium text-gray-700">Message {i + 1}</span>{sequenceForm.items.length > 1 && <button onClick={() => handleRemoveSequenceItem(i)} className="text-red-500"><X className="h-4 w-4" /></button>}</div><div className="grid grid-cols-4 gap-2 mb-3">{CONTENT_TYPES.map((t) => <button key={t.value} onClick={() => { handleClearSeqMedia(i); handleUpdateSequenceItem(i, { content_type: t.value }); }} className={`p-2 rounded border text-xs flex items-center justify-center space-x-1 ${item.content_type === t.value ? 'border-whatsapp-dark bg-green-50 text-whatsapp-dark' : 'border-gray-200 text-gray-600'}`}><t.icon className="h-3 w-3" /><span>{t.label}</span></button>)}</div>{item.content_type !== 'text' && <div className="mb-3">{(item.localPreviewUrl || item.media_url) ? <MediaPreview url={item.localPreviewUrl || item.media_url || ''} mimeType={item.media_mime_type} onRemove={() => handleClearSeqMedia(i)} /> : (item.content_type === 'audio' ? <VoiceRecorder onRecordComplete={(b) => handleSeqRecordComplete(i, b)} onClear={() => handleClearSeqMedia(i)} /> : <FileUpload accept={getAccept(item.content_type)} onFileSelect={(f) => handleSeqFileSelect(i, f)} isUploading={isUploading} />)}</div>}<textarea value={item.content || ''} onChange={(e) => handleUpdateSequenceItem(i, { content: e.target.value })} placeholder={item.content_type === 'text' ? 'Content...' : 'Caption...'} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm resize-none" /><div className="mt-3 flex items-center space-x-3"><Clock className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500">Delay:</span><input type="number" min="0" value={item.delay_min_seconds} onChange={(e) => handleUpdateSequenceItem(i, { delay_min_seconds: parseInt(e.target.value) || 0 })} className="w-16 px-2 py-1 border rounded text-sm" /><span className="text-xs">to</span><input type="number" min="0" value={item.delay_max_seconds} onChange={(e) => handleUpdateSequenceItem(i, { delay_max_seconds: parseInt(e.target.value) || 0 })} className="w-16 px-2 py-1 border rounded text-sm" /><span className="text-xs">sec</span></div></div>))}</div></div><div className="flex space-x-3 pt-4"><button onClick={() => setShowSequenceModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleSaveSequence} disabled={!sequenceForm.name || !sequenceForm.items.length || isUploading} className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg disabled:opacity-50 flex items-center justify-center space-x-2">{isUploading && <Loader2 className="h-4 w-4 animate-spin" />}<span>{editingSequence ? 'Save' : 'Create'}</span></button></div></div></div></div></div>)}
    </div>
  );
}
