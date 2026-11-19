// @ts-nocheck
import { useRef, useState } from 'react';
import { Paperclip, Image, FileText, Camera, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilePreviewModal } from '@/components/chat/FilePreviewModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MediaType = 'image' | 'video' | 'document' | 'audio';

interface FileUploadButtonProps {
  onFileSelect: (file: File, type: MediaType) => void;
  uploading?: boolean;
}

const EXTENSION_MIME: Record<string, string> = {
  apk: 'application/vnd.android.package-archive',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  epub: 'application/epub+zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  amr: 'audio/amr',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const mimeFromName = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_MIME[extension] || '';
};

const normalizeFile = (file: File) => {
  const mime = file.type || mimeFromName(file.name) || 'application/octet-stream';
  if (file.type === mime) return file;
  try {
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
};

const classifyFile = (file: File): MediaType => {
  const mime = (file.type || mimeFromName(file.name) || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};

export function FileUploadButton({ onFileSelect, uploading }: FileUploadButtonProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState<MediaType>('document');
  const [showPreview, setShowPreview] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const normalized = normalizeFile(file);
      setPendingFile(normalized);
      setPendingType(classifyFile(normalized));
      setShowPreview(true);
      e.target.value = '';
    }
  };

  const handleSend = () => {
    if (pendingFile) {
      onFileSelect(pendingFile, pendingType);
      setShowPreview(false);
      setPendingFile(null);
    }
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-[45px] w-[45px] shrink-0 text-zinc-500 hover:text-zinc-600 hover:bg-zinc-500/10"
          >
            <Paperclip className="h-[29px] w-[29px]" strokeWidth={2.75} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2 text-blue-500" />
            Photos & Videos
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
            <FileText className="h-4 w-4 mr-2 text-purple-500" />
            Document
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => audioInputRef.current?.click()}>
            <Music className="h-4 w-4 mr-2 text-orange-500" />
            Audio File
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
            <Camera className="h-4 w-4 mr-2 text-red-500" />
            Camera
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FilePreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        file={pendingFile}
        type={pendingType}
        onSend={handleSend}
        sending={uploading}
      />
    </>
  );
}
