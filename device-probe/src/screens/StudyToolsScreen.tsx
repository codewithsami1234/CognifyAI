import { BodyText, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';

export function StudyToolsScreen({
  onBack,
  onHistory,
  onSaved,
  onFlashcards,
  onAnalytics,
  onPractice,
  onPlan,
  onModels,
  onDocumentChat,
  hasDocument,
}: {
  onBack: () => void;
  onHistory: () => void;
  onSaved: () => void;
  onFlashcards: () => void;
  onAnalytics: () => void;
  onPractice: () => void;
  onPlan: () => void;
  onModels: () => void;
  onDocumentChat: () => void;
  hasDocument: boolean;
}) {
  return (
    <ScreenFrame title="Study tools" onBack={onBack}>
      <BodyText>These tools read and write the local study database. The tutor, library, assessment, and coach stay on the dashboard.</BodyText>
      <SectionLabel>Review</SectionLabel>
      <SecondaryButton title="Learning history" onPress={onHistory} />
      <SecondaryButton title="Saved knowledge" onPress={onSaved} />
      <SecondaryButton title="Flashcards" onPress={onFlashcards} />
      <SecondaryButton title="Learning analytics" onPress={onAnalytics} />
      <SectionLabel>Practice</SectionLabel>
      <SecondaryButton title="Adaptive practice" onPress={onPractice} />
      <SecondaryButton title="Study plan" onPress={onPlan} />
      <SecondaryButton title="Ask about the open document" onPress={onDocumentChat} disabled={!hasDocument} />
      <SectionLabel>Device</SectionLabel>
      <SecondaryButton title="Offline models" onPress={onModels} />
    </ScreenFrame>
  );
}
