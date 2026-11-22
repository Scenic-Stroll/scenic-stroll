import { useLocalSearchParams } from 'expo-router';

import {
  BoardPreview,
  BoardsPreview,
  PreviewMenu,
  ShopPreview,
  StaffPreview,
  StudentPreview,
  TeacherPreview,
} from '@/screens/preview/screens';

/** /preview/boards, /preview/board?board=…, /preview/teacher, … (pins phase 7, D57). */
export default function PreviewScreen() {
  const { screen, board } = useLocalSearchParams<{ screen: string; board?: string }>();
  switch (screen) {
    case 'boards':
      return <BoardsPreview />;
    case 'board':
      return <BoardPreview boardId={board} />;
    case 'teacher':
      return <TeacherPreview />;
    case 'student':
      return <StudentPreview />;
    case 'shop':
      return <ShopPreview />;
    case 'staff':
      return <StaffPreview />;
    default:
      return <PreviewMenu />;
  }
}
