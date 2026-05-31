import type { Notice } from "../lib/useCloudOpenFlow";

const noticeToneClass: Record<Notice["tone"], string> = {
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  error: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  info: "border-brand/30 bg-brand/10 text-brand",
};

export function NoticeToast({ notice }: { notice: Notice | null }) {
  if (!notice) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2 text-[13px] shadow-2xl backdrop-blur ${noticeToneClass[notice.tone]}`}
    >
      {notice.text}
    </div>
  );
}
