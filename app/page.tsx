"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BlobFile } from "@/lib/types";
import { fmtSize, fmtDate, iconFor, nameFromPathname } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import styles from "./page.module.css";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export default function Home() {
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [showSecretForm, setShowSecretForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const [showPastePanel, setShowPastePanel] = useState(false);
  const [pasteCode, setPasteCode] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");
  const [pasteUploading, setPasteUploading] = useState(false);
  const [viewFile, setViewFile] = useState<{ name: string; content: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function verifySecret(secret: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      });
      const data = await res.json().catch(() => ({}));
      // Only accept an explicit {ok:true} from the server — never trust status alone
      if (res.ok && data.ok === true) return { ok: true };
      return { ok: false, error: data.error || "Wrong password" };
    } catch {
      return { ok: false, error: "Could not reach server" };
    }
  }

  // Restore admin session from localStorage — but re-verify with the server
  useEffect(() => {
    const stored = localStorage.getItem("fs_admin_secret");
    if (!stored) return;
    verifySecret(stored).then((r) => {
      if (r.ok) {
        setAdminSecret(stored);
        setIsAdmin(true);
      } else {
        localStorage.removeItem("fs_admin_secret");
      }
    });
  }, []);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (data.files) setFiles(data.files);
    } catch {
      showToast("Failed to load files", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  async function handleSecretSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = secretInput.trim();
    if (!val) return;
    const result = await verifySecret(val);
    if (!result.ok) {
      showToast(result.error || "Invalid secret", "err");
      return;
    }
    localStorage.setItem("fs_admin_secret", val);
    setAdminSecret(val);
    setIsAdmin(true);
    setShowSecretForm(false);
    setSecretInput("");
    showToast("Admin mode enabled");
  }

  function handleLogout() {
    localStorage.removeItem("fs_admin_secret");
    setAdminSecret("");
    setIsAdmin(false);
    showToast("Logged out");
  }

  async function uploadFiles(fileList: FileList) {
    const toUpload = Array.from(fileList);
    if (!toUpload.length) return;

    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      setUploadLabel(
        toUpload.length > 1
          ? `Uploading ${file.name} (${i + 1}/${toUpload.length})…`
          : `Uploading ${file.name}…`
      );
      setUploadProgress(Math.round((i / toUpload.length) * 100));

      if (file.size > MAX_BYTES) {
        showToast(`${file.name} exceeds 50 MB limit`, "err");
        continue;
      }

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "x-filename": encodeURIComponent(file.name),
            "x-admin-secret": adminSecret,
            "content-type": file.type || "application/octet-stream",
            "content-length": String(file.size),
          },
          body: file,
          // @ts-expect-error — duplex needed for streaming body in some envs
          duplex: "half",
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || "Upload failed", "err");
        } else {
          showToast(`${file.name} uploaded ✓`);
        }
      } catch {
        showToast(`Failed to upload ${file.name}`, "err");
      }
    }

    setUploadProgress(100);
    setTimeout(() => {
      setUploading(false);
      setUploadProgress(0);
    }, 600);

    fetchFiles();
  }

  async function deleteFile(url: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeletingUrl(url);
    try {
      const res = await fetch("/api/delete", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Delete failed", "err");
      } else {
        showToast(`${name} deleted`);
        setFiles((prev) => prev.filter((f) => f.url !== url));
      }
    } catch {
      showToast("Delete failed", "err");
    } finally {
      setDeletingUrl(null);
    }
  }

  async function handlePasteUpload() {
    if (!pasteCode.trim()) {
      showToast("Nothing to upload — paste some code first", "err");
      return;
    }
    const rawName = pasteFilename.trim() || "snippet";
    const filename = rawName.endsWith(".txt") ? rawName : `${rawName}.txt`;
    const blob = new Blob([pasteCode], { type: "text/plain" });

    setPasteUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "x-filename": encodeURIComponent(filename),
          "x-admin-secret": adminSecret,
          "content-type": "text/plain",
          "content-length": String(blob.size),
        },
        body: blob,
        // @ts-expect-error — duplex needed for streaming body in some envs
        duplex: "half",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Upload failed", "err");
      } else {
        showToast(`${filename} created ✓`);
        setPasteCode("");
        setPasteFilename("");
        setShowPastePanel(false);
        fetchFiles();
      }
    } catch {
      showToast("Upload failed", "err");
    } finally {
      setPasteUploading(false);
    }
  }

  async function handleViewFile(file: { url: string; pathname: string }) {
    const name = nameFromPathname(decodeURIComponent(file.pathname));
    try {
      const res = await fetch(file.url);
      const text = await res.text();
      setViewFile({ name, content: text });
    } catch {
      showToast("Could not load file content", "err");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  return (
    <>
      {/* Safe area top bar */}
      <div className={styles.safeTop} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            File<span>Share</span>
          </div>
          <div className={styles.headerRight}>
            {isAdmin ? (
              <button className={`${styles.btn} ${styles.sm}`} onClick={handleLogout}>
                Sign out
              </button>
            ) : (
              <button
                className={`${styles.btn} ${styles.sm}`}
                onClick={() => setShowSecretForm((v) => !v)}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>

        {/* Admin secret form */}
        {showSecretForm && !isAdmin && (
          <form className={styles.secretForm} onSubmit={handleSecretSubmit}>
            <input
              className={styles.secretInput}
              type="password"
              placeholder="Enter admin secret…"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              autoFocus
            />
            <button className={`${styles.btn} ${styles.primary}`} type="submit">
              Unlock
            </button>
          </form>
        )}

        {/* Upload zone — only shown to admin */}
        {isAdmin && (
          <div className={styles.uploadSection}>
            <div
              className={`${styles.dropZone} ${dragging ? styles.drag : ""} ${uploading ? styles.disabled : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className={styles.fileInput}
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
              <div className={styles.uploadIcon}>📁</div>
              <p className={styles.uploadTitle}>
                {dragging ? "Drop to upload" : "Drop files here or tap to browse"}
              </p>
              <p className={styles.uploadSub}>Max 50 MB per file · any format</p>
              <span className={`${styles.btn} ${styles.primary} ${styles.noClick}`}>
                Choose files
              </span>
            </div>

            {uploading && (
              <div className={styles.progressCard}>
                <div className={styles.progressTop}>
                  <span className={styles.progressLabel}>{uploadLabel}</span>
                  <span className={styles.progressPct}>{uploadProgress}%</span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paste-code panel — shown to admin only */}
        {isAdmin && (
          <div className={styles.pasteSection}>
            <button
              className={`${styles.btn} ${showPastePanel ? styles.primary : ""}`}
              onClick={() => setShowPastePanel((v) => !v)}
            >
              📋 {showPastePanel ? "Close" : "Paste Code"}
            </button>

            {showPastePanel && (
              <div className={styles.pasteCard}>
                <p className={styles.pasteLabel}>Paste your code or text below — it will be saved as a .txt file.</p>
                <input
                  className={styles.pasteInput}
                  type="text"
                  placeholder="Filename (e.g. my-script) — defaults to snippet.txt"
                  value={pasteFilename}
                  onChange={(e) => setPasteFilename(e.target.value)}
                />
                <textarea
                  className={styles.pasteTextarea}
                  placeholder="Paste code here…"
                  value={pasteCode}
                  onChange={(e) => setPasteCode(e.target.value)}
                  spellCheck={false}
                />
                <div className={styles.pasteActions}>
                  <span className={styles.pasteChars}>{pasteCode.length} chars</span>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    onClick={handlePasteUpload}
                    disabled={pasteUploading || !pasteCode.trim()}
                  >
                    {pasteUploading ? "Saving…" : "Save as .txt ↑"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* File list */}
        <div className={styles.sectionHead}>
          <p className={styles.sectionTitle}>Files</p>
          <span className={styles.badge}>
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>
            <div className={styles.spinner} />
          </div>
        ) : files.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📂</div>
            <p className={styles.emptyText}>No files uploaded yet</p>
          </div>
        ) : (
          <div className={styles.fileList}>
            {files.map((file) => {
              const name = nameFromPathname(
                decodeURIComponent(file.pathname)
              );
              const isDeleting = deletingUrl === file.url;
              const isText = /\.(txt|md|csv|json|xml|html|css|js|ts|py|cs|log|sh|yaml|yml|ini|env|toml|sql|tsx|jsx|mjs|cjs)$/i.test(name);
              return (
                <div key={file.url} className={`${styles.fileCard} ${isDeleting ? styles.deleting : ""}`}>
                  <div className={styles.fileIcon}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconFor(name)} alt="" width={44} height={44} draggable={false} />
                  </div>
                  <div className={styles.fileInfo}>
                    <p className={styles.fileName} title={name}>{name}</p>
                    <p className={styles.fileMeta}>
                      {fmtSize(file.size)} · {fmtDate(file.uploadedAt)}
                    </p>
                  </div>
                  <div className={styles.fileActions}>
                    {isText && (
                      <button
                        className={`${styles.btn} ${styles.sm}`}
                        onClick={() => handleViewFile(file)}
                        aria-label={`View ${name}`}
                      >
                        👁 View
                      </button>
                    )}
                    <a
                      className={`${styles.btn} ${styles.sm}`}
                      href={file.downloadUrl}
                      download={name}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Download ${name}`}
                    >
                      ↓ Download
                    </a>
                    {isAdmin && (
                      <button
                        className={`${styles.btn} ${styles.sm} ${styles.danger}`}
                        onClick={() => deleteFile(file.url, name)}
                        disabled={isDeleting}
                        aria-label={`Delete ${name}`}
                      >
                        {isDeleting ? "…" : "✕"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <p style={{ textAlign: "center", fontSize: 11, opacity: 0.4, padding: "16px 0 32px" }}>
        {APP_VERSION}
      </p>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "err" ? styles.toastErr : styles.toastOk}`}>
          {toast.msg}
        </div>
      )}

      {/* File viewer modal */}
      {viewFile && (
        <div className={styles.modalOverlay} onClick={() => setViewFile(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{viewFile.name}</span>
              <button className={`${styles.btn} ${styles.sm}`} onClick={() => setViewFile(null)}>✕ Close</button>
            </div>
            <pre className={styles.modalContent}>{viewFile.content}</pre>
          </div>
        </div>
      )}
    </>
  );
}
