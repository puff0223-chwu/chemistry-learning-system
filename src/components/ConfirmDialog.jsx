export default function ConfirmDialog({ title, message, confirmText = '確定', busy, error, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 z-50" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 shadow-xl">
        {title && <h2 className="text-lg font-bold">{title}</h2>}
        <p className="text-slate-700 leading-relaxed">{message}</p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2">
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 font-bold"
          >
            {busy ? '刪除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
