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

interface FileUploadButtonProps {
  onFileSelect: (file: File, type: 'image' | 'document' | 'audio') => void;
  uploading?: boolean;
}

export function FileUploadButton({ onFileSelect, uploading }: FileUploadButtonProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState<'image' | 'document' | 'audio'>('image');
  const [showPreview, setShowPreview] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document' | 'audio') => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setPendingType(type);
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
      <input ref={imageInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFileChange(e, 'image')} />
      <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" className="hidden" onChange={(e) => handleFileChange(e, 'document')} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileChange(e, 'image')} />
      <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileChange(e, 'audio')} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-[45px] w-[45px] shrink-0 text-[hsl(var(--chat-control-icon))]">
            <Paperclip className="h-[29px] w-[29px]" strokeWidth={2.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2 text-muted-foreground" />
            Photos & Videos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
            <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
            Document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => audioInputRef.current?.click()}>
            <Music className="h-4 w-4 mr-2 text-muted-foreground" />
            Audio File
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
            <Camera className="h-4 w-4 mr-2 text-muted-foreground" />
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
