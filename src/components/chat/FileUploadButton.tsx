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
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
            <Paperclip className="h-5 w-5 text-muted-foreground" />
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
            <Camera className="h-4 w-4 mr-2 text-pink-500" />
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
