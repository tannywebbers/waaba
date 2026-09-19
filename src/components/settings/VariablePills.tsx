// @ts-nocheck
import { APP_VARIABLES } from '@/lib/templateVariables';

interface VariablePillsProps {
  onInsert: (variable: string) => void;
  label?: string;
}

/** Clickable pills that insert {{variable}} tokens at the caret. */
export function VariablePills({ onInsert, label = 'Click to insert variable:' }: VariablePillsProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {APP_VARIABLES.map((v) => (
          <button
            key={v.value}
            type="button"
            title={v.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(v.value)}
            className="px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {`{{${v.value}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}
