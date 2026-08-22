import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status?: string;
  category?: string;
  components: any[];
}

interface Props {
  visible: boolean;
  templates: MetaTemplate[];
  loading: boolean;
  onClose: () => void;
  onSend: (template: MetaTemplate, params: Record<string, string>, previewText: string) => void;
}

function extractVariables(components: any[]): string[] {
  const body = components?.find(c => c.type === 'BODY');
  const text: string = body?.text || '';
  const matches: string[] = text.match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(matches.map((v: string) => v.trim()))];
}

function buildPreview(template: MetaTemplate, params: Record<string, string>): string {
  const body = template.components?.find(c => c.type === 'BODY');
  let preview = body?.text || template.name;
  Object.entries(params).forEach(([key, value]) => {
    preview = preview.split(key).join(value || key);
  });
  return preview;
}

export function TemplatePickerModal({ visible, templates, loading, onClose, onSend }: Props) {
  const [selected, setSelected] = useState<MetaTemplate | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setParams({});
    }
  }, [visible]);

  const variables = useMemo(() => (selected ? extractVariables(selected.components) : []), [selected]);

  const renderList = () => (
    <FlatList
      data={templates.filter(t => t.status === 'APPROVED')}
      keyExtractor={t => t.id}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={44} color="#c8d2d8" />
          <Text style={styles.emptyTitle}>No approved templates</Text>
          <Text style={styles.emptySubtitle}>Create templates in the web app first</Text>
        </View>
      }
      renderItem={({ item }) => {
        const body = item.components?.find(c => c.type === 'BODY');
        return (
          <TouchableOpacity style={styles.row} onPress={() => setSelected(item)}>
            <View style={styles.rowIcon}>
              <Ionicons name="albums" size={18} color="#28A156" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub} numberOfLines={2}>
                {body?.text || `${item.language}${item.category ? ` · ${item.category}` : ''}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8696a0" />
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderDetail = () => (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.backRow} onPress={() => setSelected(null)}>
        <Ionicons name="arrow-back" size={20} color="#111b21" />
        <Text style={styles.backRowText}>{selected!.name}</Text>
      </TouchableOpacity>

      <View style={styles.previewCard}>
        <Text style={styles.previewLabel}>Preview</Text>
        <Text style={styles.previewBody}>
          {buildPreview(selected!, params)}
        </Text>
      </View>

      {variables.length > 0 && (
        <FlatList
          data={variables}
          keyExtractor={v => v}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 16 }}
          ListHeaderComponent={<Text style={styles.varsTitle}>Fill in variables</Text>}
          renderItem={({ item }) => (
            <TextInput
              style={styles.varInput}
              placeholder={item}
              placeholderTextColor="#8696a0"
              value={params[item] || ''}
              onChangeText={v => setParams(p => ({ ...p, [item]: v }))}
            />
          )}
        />
      )}

      <View style={{ padding: 16 }}>
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={() =>
            onSend(
              selected!,
              params,
              buildPreview(selected!, params)
            )
          }
        >
          <Ionicons name="send" size={17} color="#fff" />
          <Text style={styles.sendBtnText}>Send template</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {!selected ? (
            <>
              <Text style={styles.title}>Templates</Text>
              {loading ? (
                <ActivityIndicator color="#25D366" style={{ marginTop: 30 }} />
              ) : (
                renderList()
              )}
            </>
          ) : (
            renderDetail()
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,20,26,0.5)', justifyContent: 'flex-end' },
  sheet: {
    height: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d7db',
    marginBottom: 10,
  },
  title: { fontSize: 19, fontWeight: '700', color: '#111b21', paddingHorizontal: 16, marginBottom: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(37,211,102,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15.5, fontWeight: '600', color: '#111b21' },
  rowSub: { fontSize: 13, color: '#667781', marginTop: 2 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  backRowText: { fontSize: 17, fontWeight: '700', color: '#111b21' },

  previewCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f0f2f5',
  },
  previewLabel: { fontSize: 11.5, fontWeight: '700', color: '#8696a0', marginBottom: 4 },
  previewBody: { fontSize: 15, color: '#111b21', lineHeight: 21 },

  varsTitle: { fontSize: 13.5, fontWeight: '700', color: '#667781', paddingTop: 4 },
  varInput: {
    borderWidth: 1,
    borderColor: '#d1d7db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111b21',
    backgroundColor: '#fafafa',
  },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 13,
  },
  sendBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111b21', marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: '#667781' },
});
