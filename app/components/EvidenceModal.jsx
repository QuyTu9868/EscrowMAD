'use client';

import { useState } from 'react';
import { CameraIcon, CloseIcon, AlertIcon } from './Icons';

/**
 * Bat anh bang chung tu buyer truoc khi doi tra hang.
 *
 * Truoc day nut Return gui thang chuoi 'evidence' vao contract - khong phai
 * hash IPFS that. Hau qua: AI agent di tai anh thi 404, va tranh chap khong
 * bao gio xu ly duoc. Anh o day chinh la "hang thuc nhan" ma agent doi chieu
 * voi anh seller dang luc dau.
 */
export default function EvidenceModal({ isOpen, onClose, onConfirm, isLoading }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  function reset() {
    setFile(null);
    setPreview('');
    setNote('');
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError('');
    if (!file) return setError('Attach a photo of the item you received.');

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload-ipfs', { method: 'POST', body: form });
      if (!res.ok) throw new Error('upload failed');
      const { hash } = await res.json();
      reset();
      onConfirm(hash, note.trim());
    } catch {
      setError('Could not upload the photo. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Return this item</h2>
          <button type="button" onClick={handleClose} aria-label="Close">
            <CloseIcon size={15} />
          </button>
        </div>

        <p className="modal-lead">
          Photograph the item as it arrived. If the seller refuses the return and
          the case goes to dispute, this photo is what the agent compares against
          the seller&apos;s listing photo.
        </p>

        {preview ? (
          <div className="evidence-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Item as received" />
            <button type="button" onClick={() => { setFile(null); setPreview(''); }}>Change</button>
          </div>
        ) : (
          <label className="evidence-drop">
            <CameraIcon size={16} />
            Attach photo of what arrived
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFile(f);
                setPreview(URL.createObjectURL(f));
              }}
            />
          </label>
        )}

        <textarea
          className="input evidence-note"
          rows={3}
          placeholder="What is wrong with it? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && (
          <p className="modal-error mono">
            <AlertIcon size={12} /> {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            <span className="btn-label">Cancel</span>
          </button>
          <button
            type="button"
            className="btn btn-warn"
            onClick={handleSubmit}
            disabled={uploading || isLoading || !file}
          >
            <span className="btn-label">
              {(uploading || isLoading) && <span className="spinner" />}
              {uploading ? 'Uploading' : 'Request Return'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
