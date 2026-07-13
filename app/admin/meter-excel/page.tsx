'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import MeterTemplateFill from '@/components/admin/MeterTemplateFill';
import MeterExcelUpload from '@/components/admin/MeterExcelUpload';
import MeterExcelExport from '@/components/admin/MeterExcelExport';

export default function MeterExcelPage() {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">야장 엑셀관리자</h1>
          <p className="text-sm text-zinc-500 mt-1">DB 데이터 다운로드 및 원본 양식 채우기</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-lg hover:bg-emerald-300 transition-colors"
        >
          <Upload size={14} />
          엑셀 업로드
        </button>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-base font-semibold text-white mb-1">DB 데이터 엑셀 다운로드</h2>
          <p className="text-xs text-zinc-500 mb-4">DB에 저장된 모든 컬럼을 엑셀로 내려받습니다. 블록/날짜 필터 선택 가능.</p>
          <MeterExcelExport />
        </section>

        <div className="border-t border-zinc-800" />

        <section>
          <h2 className="text-base font-semibold text-white mb-1">원본 양식 채우기</h2>
          <p className="text-xs text-zinc-500 mb-4">수용가조사기록지 원본 파일을 올리면 DB 데이터를 채워서 다운로드합니다.</p>
          <MeterTemplateFill />
        </section>
      </div>

      {showUpload && <MeterExcelUpload onClose={() => setShowUpload(false)} />}
    </div>
  );
}
