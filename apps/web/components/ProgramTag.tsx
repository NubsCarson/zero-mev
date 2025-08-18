'use client';

import { formatProgramDisplay, ProgramInfo } from '@/lib/programRegistry';

interface ProgramTagProps {
  programId: string;
  onClick?: () => void;
  showFullId?: boolean;
  className?: string;
}

export default function ProgramTag({ programId, onClick, showFullId = false, className = '' }: ProgramTagProps) {
  const { name, shortId, programInfo } = formatProgramDisplay(programId);

  return (
    <div 
      className={`group cursor-pointer transition-all duration-200 ${className}`}
      onClick={onClick}
    >
      <div className="space-y-1">
        {/* Program Name */}
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${programInfo.color}`}>
            {name}
          </span>
          {programInfo.isKnown && (
            <span className={`px-2 py-0.5 text-xs rounded-full border ${programInfo.color} ${programInfo.bgColor} border-opacity-50`}>
              {programInfo.category}
            </span>
          )}
        </div>
        
        {/* Program ID */}
        <div className="text-xs text-gray-400 font-mono">
          {showFullId ? programId : shortId}
        </div>
      </div>
      
      {/* Hover effect */}
      <div className={`h-0.5 w-0 group-hover:w-full transition-all duration-300 ${programInfo.bgColor} opacity-60 mt-1`}></div>
    </div>
  );
}

export function ProgramBadge({ programId, className = '' }: { programId: string; className?: string }) {
  const { name, programInfo } = formatProgramDisplay(programId);
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${programInfo.color} ${programInfo.bgColor} border-opacity-50 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${programInfo.bgColor} opacity-80`}></div>
      {programInfo.isKnown ? name : `${programId.slice(0, 8)}...`}
    </span>
  );
}