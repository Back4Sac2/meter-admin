'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import MeterTemplateFill from '@/components/admin/MeterTemplateFill';
import MeterExcelUpload from '@/components/admin/MeterExcelUpload';

export default function MeterExcelPage() {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">야장 엑셀관리자</h1>
          <p className="text-sm text-zinc-500 mt-1">원본 양식에 DB 데이터를 채워서 다운로드</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-lg hover:bg-emerald-300 transition-colors"
        >
          <Upload size={14} />
          엑셀 업로드
        </button>
      </div>
      <MeterTemplateFill />
      {showUpload && <MeterExcelUpload onClose={() => setShowUpload(false)} />}
    </div>
  );
}
