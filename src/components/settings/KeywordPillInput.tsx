// @ts-nocheck
import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface KeywordPillInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
}

/**
 * Keyword entry that turns each finished keyword into a removable pill.
 * Keywords are committed on comma, Enter or a new line, and may contain spaces.
 */
export function KeywordPillInput({ keywords, onChange, placeholder }: KeywordPillInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (text: string) => {
    const parts = String(text)
      .split(/[,\n\r]+/)
      .map((k) => k.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...keywords];
    for (const p of parts) {
      if (!next.some((k) => k.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && keywords.length > 0) {
      onChange(keywords.slice(0, -1));
    }
  };

  const handleChange = (value: string) => {
    if (/[,\n\r]/.test(value)) {
      const pieces = value.split(/[,\n\r]/);
      const last = pieces.pop() ?? '';
      commit(pieces.join(','));
      setDraft(last);
    } else {
      setDraft(value);
    }
  };

  const remove = (index: number) => onChange(keywords.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k, i) => (
            <span
              key={`${k}-${i}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary"
            >
              {k}
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-full hover:bg-primary/20 p-0.5"
                aria-label={`Remove ${k}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          commit(draft);
          setDraft('');
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (/[,\n\r]/.test(text)) {
            e.preventDefault();
            commit(text);
            setDraft('');
          }
        }}
        placeholder={placeholder || 'hi, hello, good morning'}
      />
      <p className="text-xs text-muted-foreground">
        Separate keywords with a comma, a new line, or press Enter. A keyword can be more than one word.
      </p>
    </div>
  );
}
