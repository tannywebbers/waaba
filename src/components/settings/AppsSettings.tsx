import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, AppWindow } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useApps } from '@/hooks/useApps';
import { toast } from '@/hooks/use-toast';

export function AppsSettings() {
  const { apps, addApp, renameApp, deleteApp, loading } = useApps();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async () => {
    const n = newName.trim();
    if (!n) return;
    if (apps.some(a => a.name.toLowerCase() === n.toLowerCase())) {
      toast({ title: 'App already exists', variant: 'destructive' });
      return;
    }
    await addApp(n);
    setNewName('');
    toast({ title: 'App added' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
          <AppWindow className="h-5 w-5 text-primary" />
          Apps
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the list of apps used across bulk messaging, quick chat and contacts.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          παceholder="App name"
          placeholder="App name"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1"
        />
        <Button onClick={handleAdd} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Add App
        </Button>
      </div>

      <div className="rounded-lg border border-panel-border divide-y divide-panel-border bg-card">
        {loading && apps.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        )}
        {!loading && apps.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No apps yet. Add your first app above.
          </div>
        )}
        {apps.map((app) => (
          <div key={app.id} className="flex items-center gap-2 p-3">
            {editingId === app.id ? (
              <>
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameApp(app.id, editValue);
                      setEditingId(null);
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  className="flex-1"
                />
                <Button size="icon" variant="ghost" onClick={() => { renameApp(app.id, editValue); setEditingId(null); }}>
                  <Check className="h-4 w-4 text-primary" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate font-medium">{app.name}</span>
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(app.id); setEditValue(app.name); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${app.name}"?`)) deleteApp(app.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
