'use client';

import { useState } from 'react';
import MeterExcelDiff from '@/components/admin/MeterExcelDiff';
import MeterTemplateFill from '@/components/admin/MeterTemplateFill';

const TABS = [
  { id: 'diff',  label: '차분 다운로드', desc: '기존 엑셀과 비교해 미처리 항목만 다운로드' },
  { id: 'fill',  label: '양식 채우기',   desc: '원본 양식에 DB 데이터를 채워서 다운로드' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function MeterExcelPage() {
  const [tab, setTab] = useState<TabId>('diff');
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">야장 엑셀관리자</h1>
        <p className="text-sm text-zinc-500 mt-1">{current.desc}</p>
      </div>

      <div className="flex gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm rounded-lg font-semibold transition-colors ${
              tab === t.id
                ? 'bg-emerald-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'diff' && <MeterExcelDiff />}
      {tab === 'fill' && <MeterTemplateFill />}
    </div>
  );
}
