export type ChatVariant = "default" | "game-modal";

export interface ChatLabelSet {
  agentStarting?: string;
  agentVoiceOff?: string;
  agentVoiceOn?: string;
  attachImage?: string;
  cancel?: string;
  clearSearch?: string;
  chatIconLabel?: string;
  chats?: string;
  closePanel?: string;
  copied?: string;
  copiedAria?: string;
  copy?: string;
  delete?: string;
  deleteConfirm?: string;
  deleteNo?: string;
  deleteYes?: string;
  edit?: string;
  expandChatsPanel?: string;
  inputPlaceholder?: string;
  inputPlaceholderNarrow?: string;
  listening?: string;
  micTitleIdleEnhanced?: string;
  micTitleIdleStandard?: string;
  newChat?: string;
  none?: string;
  noMatchingChats?: string;
  play?: string;
  releaseToSend?: string;
  rename?: string;
  responseInterrupted?: string;
  saveAndResend?: string;
  searchChats?: string;
  saving?: string;
  send?: string;
  sendMessageTo?: string;
  startConversation?: string;
  stopGeneration?: string;
  stopListening?: string;
  stopSpeaking?: string;
  toBeginChatting?: string;
  voiceInput?: string;
}

export interface ChatAttachmentItem {
  alt: string;
  id: string;
  name: string;
  src: string;
}

export interface ChatMessageData {
  id: string;
  interrupted?: boolean;
  role: string;
  source?: string;
  text: string;
}

export interface ChatMessageLabels extends ChatLabelSet {}

export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAtLabel?: string;
}

export interface ChatConversationLabels extends ChatLabelSet {}
